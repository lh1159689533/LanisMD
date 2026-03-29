use std::path::PathBuf;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::models::RecentFile;

pub struct ConfigService {
    config_path: PathBuf,
}

impl ConfigService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let config_dir = app_data_dir.join("com.lanismd.app");
        let config_path = config_dir.join("config.json");
        std::fs::create_dir_all(&config_dir).ok();
        Self { config_path }
    }

    pub fn get_config(&self, key: Option<&str>) -> AppResult<Value> {
        let config = self.load_config();
        match key {
            None => Ok(config),
            Some(k) => {
                let keys: Vec<&str> = k.split('.').collect();
                let mut current = &config;
                for (i, k_part) in keys.iter().enumerate() {
                    match current.get(*k_part) {
                        Some(v) => {
                            if i == keys.len() - 1 {
                                return Ok(v.clone());
                            }
                            current = v;
                        }
                        None => return Err(AppError::Config(format!("Key not found: {}", k))),
                    }
                }
                Ok(config)
            }
        }
    }

    pub fn set_config(&self, key: &str, value: Value) -> AppResult<()> {
        let mut config = self.load_config();
        let keys: Vec<&str> = key.split('.').collect();
        if keys.len() == 1 {
            config[key] = value;
        } else {
            let mut current = config
                .as_object_mut()
                .ok_or_else(|| AppError::Config("Config is not an object".into()))?;
            for (i, k_part) in keys.iter().enumerate() {
                if i == keys.len() - 1 {
                    current.insert(k_part.to_string(), value.clone());
                } else {
                    if !current.contains_key(*k_part) {
                        current.insert(k_part.to_string(), Value::Object(Default::default()));
                    }
                    current = current
                        .get_mut(*k_part)
                        .and_then(|v| v.as_object_mut())
                        .ok_or_else(|| AppError::Config(format!("Cannot navigate to: {}", key)))?;
                }
            }
        }
        self.save_config(&config)
    }

    pub fn get_recent_files(&self, limit: Option<u32>) -> AppResult<Vec<RecentFile>> {
        let config = self.load_config();
        let mut files: Vec<RecentFile> = config
            .get("recentFilesList")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let limit = limit.unwrap_or(20) as usize;
        files.truncate(limit);
        Ok(files)
    }

    pub fn add_recent_file(&self, path: &str) -> AppResult<()> {
        let mut config = self.load_config();
        let max_count = config
            .get("recentFiles")
            .and_then(|v| v.get("maxCount"))
            .and_then(|v| v.as_u64())
            .unwrap_or(20) as usize;

        let mut files: Vec<RecentFile> = config
            .get("recentFilesList")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        // Remove duplicate
        files.retain(|f| f.path != path);

        let file_name = PathBuf::from(path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        files.insert(
            0,
            RecentFile {
                path: path.to_string(),
                file_name,
                last_opened_at: chrono::Utc::now().timestamp_millis(),
            },
        );

        files.truncate(max_count);
        config["recentFilesList"] = serde_json::to_value(&files).unwrap();
        self.save_config(&config)
    }

    fn load_config(&self) -> Value {
        if !self.config_path.exists() {
            return self.default_config();
        }
        let content = std::fs::read_to_string(&self.config_path).unwrap_or_default();
        let user_config: Value = serde_json::from_str(&content)
            .unwrap_or_else(|_| Value::Object(Default::default()));
        self.merge(self.default_config(), user_config)
    }

    fn save_config(&self, config: &Value) -> AppResult<()> {
        let content = serde_json::to_string_pretty(config)
            .map_err(|e| AppError::Config(e.to_string()))?;
        std::fs::write(&self.config_path, content)
            .map_err(|e| AppError::Config(e.to_string()))?;
        Ok(())
    }

    fn default_config(&self) -> Value {
        serde_json::json!({
            "theme": "system",
            "language": "system",
            "autoSave": {
                "enabled": true,
                "interval": 5000
            },
            "editor": {
                "fontSize": 16,
                "fontFamily": "system",
                "maxWidth": 800,
                "lineHeight": 1.75,
                "wordWrap": "soft",
                "showLineNumbers": true
            },
            "recentFiles": {
                "maxCount": 20
            },
            "recentFilesList": [],
            "restoreSession": false,
            "sidebar": {
                "position": "left",
                "width": 280
            }
        })
    }

    fn merge(&self, default: Value, override_val: Value) -> Value {
        match (default, override_val) {
            (Value::Object(mut d), Value::Object(o)) => {
                for (k, v) in o {
                    let merged = if d.contains_key(&k) {
                        self.merge(d[&k].clone(), v)
                    } else {
                        v
                    };
                    d.insert(k, merged);
                }
                Value::Object(d)
            }
            (_, override_val) => override_val,
        }
    }
}
