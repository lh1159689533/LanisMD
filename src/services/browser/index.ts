/**
 * Browser storage service using IndexedDB
 * Used when the app runs in browser mode (not Tauri)
 */

const DB_NAME = 'LanisMD';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const CURRENT_DOC_KEY = 'current-document';

interface StoredDocument {
  id: string;
  content: string;
  updatedAt: number;
}

class BrowserStorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create documents store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save the current document content
   */
  async saveDocument(content: string): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const doc: StoredDocument = {
        id: CURRENT_DOC_KEY,
        content,
        updatedAt: Date.now(),
      };

      const request = store.put(doc);

      request.onerror = () => {
        console.error('Failed to save document:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Load the current document content
   */
  async loadDocument(): Promise<string | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CURRENT_DOC_KEY);

      request.onerror = () => {
        console.error('Failed to load document:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const doc = request.result as StoredDocument | undefined;
        resolve(doc?.content ?? null);
      };
    });
  }

  /**
   * Clear all stored documents
   */
  async clearAll(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        console.error('Failed to clear documents:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }
}

export const browserStorageService = new BrowserStorageService();
