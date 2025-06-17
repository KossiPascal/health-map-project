import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CacheStorageService {
  constructor() { }


  public readonly excludeOnCacheReload: string[] = ['users-cache'];

  // Store data in cache
  async storeData<T>({ dbName, key, data }: { dbName: string, key: string, data: T }): Promise<boolean> {
    try {
      const cache = await caches.open(dbName);
      await cache.put(key, new Response(JSON.stringify(data)));
      return true;
    } catch (error) { }
    return false;
  }

  // Retrieve data from cache
  async getDataByKey<T>({ dbName, key }: { dbName: string, key: string }): Promise<T | null> {
    try {
      const cache = await caches.open(dbName);
      const response = await cache.match(key);
      if (response) {
        return await response.json() as T;
      }
    } catch (error) { }
    return null;
  }

  // Get all data from cache as an array
  async getAllData<T>(dbName: string): Promise<{ key: string; value: T }[]> {
    try {
      const cache = await caches.open(dbName);
      const keys = await cache.keys();
      const dataPromises = keys.map(async (request) => {
        const key = request.url;
        const response = await cache.match(request);
        if (response) {
          const value = await response.json();
          return { key, value };
        }
        return null;
      });
      const dataArray = await Promise.all(dataPromises);
      return dataArray.filter(entry => entry !== null) as { key: string; value: T }[];
    } catch (error) { }
    return [];
  }


  // Update data in cache
  async updateData<T>({ dbName, key, newData }: { dbName: string, key: any, newData: T }): Promise<boolean> {
    try {
      const existingData = await this.getDataByKey<T>({ dbName: dbName, key: key });
      if (existingData) {
        const updatedData = { ...existingData, ...newData };
        await this.storeData({ dbName: dbName, key: key, data: updatedData });
        return true;
      }
    } catch (error) { }
    return false;
  }

  // Delete data from cache by key
  async removeData({ dbName, key }: { dbName: string, key: string }): Promise<boolean> {
    try {
      const cache = await caches.open(dbName);
      await cache.delete(key);
      return true;
    } catch (error) { }
    return false;
  }

  async deleteDatabase(dbName: string): Promise<boolean> {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name === dbName)
          .map((name) => caches.delete(name))
      );
      return true;
    } catch (error) { }
    return false;
  }

  async deleteAllDatabases(): Promise<boolean> {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      return true;
    } catch (error) { }
    return false;
  }

  async keysList(dbName: string): Promise<string[]> {
    try {
      const cache = await caches.open(dbName);
      const keys = await cache.keys();
      return keys.map((request) => request.url);
    } catch (error) {
    }
    return [];
  }
}
