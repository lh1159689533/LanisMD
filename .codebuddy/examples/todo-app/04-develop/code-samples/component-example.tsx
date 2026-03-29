/**
 * 待办事项应用 - React 组件示例
 * 
 * 💻 BMAD 阶段四：Develop - 前端组件实现示例
 */

import React, { useState, useRef, useEffect } from 'react';

// ============================================
// 类型定义
// ============================================

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

interface TaskInputProps {
  onAdd: (title: string) => void;
}

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
}

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, title: string) => void;
}

// ============================================
// TaskInput 组件 - 任务输入框
// ============================================

/**
 * 任务输入组件
 * 用户可以输入任务标题并创建新任务
 */
export const TaskInput: React.FC<TaskInputProps> = ({ onAdd }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证输入
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError('请输入任务内容');
      return;
    }
    
    if (trimmedValue.length > 200) {
      setError('任务标题不能超过 200 字符');
      return;
    }
    
    // 创建任务
    onAdd(trimmedValue);
    setValue('');
    setError('');
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          placeholder="添加新任务..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg 
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={200}
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-500 text-white rounded-lg 
                     hover:bg-blue-600 transition-colors"
        >
          添加
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
    </form>
  );
};

// ============================================
// TaskItem 组件 - 单个任务项
// ============================================

/**
 * 任务项组件
 * 显示单个任务，支持完成、编辑、删除操作
 */
export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggle,
  onDelete,
  onEdit
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== task.title) {
      onEdit(task.id, trimmedValue);
    } else {
      setEditValue(task.title); // 恢复原值
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(task.title);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm('确定要删除这个任务吗？')) {
      onDelete(task.id);
    }
  };

  return (
    <div className={`
      flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm
      border border-gray-100 hover:shadow-md transition-shadow
      ${task.completed ? 'opacity-60' : ''}
    `}>
      {/* 完成复选框 */}
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task.id)}
        className="w-5 h-5 rounded border-gray-300 text-blue-500 
                   focus:ring-blue-500 cursor-pointer"
      />
      
      {/* 任务标题 */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 px-2 py-1 border border-blue-300 rounded
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={200}
        />
      ) : (
        <span
          onDoubleClick={() => setIsEditing(true)}
          className={`
            flex-1 cursor-pointer
            ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}
          `}
        >
          {task.title}
        </span>
      )}
      
      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        className="p-2 text-gray-400 hover:text-red-500 
                   transition-colors opacity-0 group-hover:opacity-100"
        title="删除任务"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

// ============================================
// TaskList 组件 - 任务列表
// ============================================

/**
 * 任务列表组件
 * 显示所有任务，分为未完成和已完成两部分
 */
export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onToggle,
  onDelete,
  onEdit
}) => {
  // 分离未完成和已完成的任务
  const incompleteTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">暂无任务</p>
        <p className="text-sm mt-2">快去创建一个吧！</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 未完成任务 */}
      {incompleteTasks.length > 0 && (
        <div className="space-y-2">
          {incompleteTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
      
      {/* 已完成任务 */}
      {completedTasks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            已完成 ({completedTasks.length})
          </h3>
          <div className="space-y-2">
            {completedTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// App 组件 - 主应用
// ============================================

/**
 * 主应用组件
 * 整合所有子组件
 */
export const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载任务
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await fetch('/api/tasks');
        const result = await response.json();
        setTasks(result.data || []);
      } catch (error) {
        console.error('加载任务失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  // 添加任务
  const handleAdd = async (title: string) => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      const result = await response.json();
      setTasks(prev => [result.data, ...prev]);
    } catch (error) {
      console.error('创建任务失败:', error);
    }
  };

  // 切换完成状态
  const handleToggle = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed })
      });
      setTasks(prev => prev.map(t => 
        t.id === id ? { ...t, completed: !t.completed } : t
      ));
    } catch (error) {
      console.error('更新任务失败:', error);
    }
  };

  // 删除任务
  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('删除任务失败:', error);
    }
  };

  // 编辑任务
  const handleEdit = async (id: string, title: string) => {
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      setTasks(prev => prev.map(t => 
        t.id === id ? { ...t, title } : t
      ));
    } catch (error) {
      console.error('编辑任务失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-lg mx-auto px-4">
        {/* 标题 */}
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
          📝 TodoApp
        </h1>
        
        {/* 输入框 */}
        <TaskInput onAdd={handleAdd} />
        
        {/* 任务列表 */}
        <TaskList
          tasks={tasks}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
        
        {/* 统计 */}
        {tasks.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-400">
            {tasks.filter(t => !t.completed).length} 个任务待完成
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
