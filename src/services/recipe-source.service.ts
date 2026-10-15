import type { AxiosInstance } from 'axios';
import type { FlowRecipeSummary, IFlowRecipe, RecipeSourceType } from '../types';
import { STARTER_RECIPES } from '../recipes/starter-recipes';
import { ENDPOINT_EXTENSION_NAME } from '../constants';

const LOCAL_STORAGE_RECIPES_KEY = 'flow_manager_custom_recipes';
const DEFAULT_COMMUNITY_FEED_URL =
  'https://raw.githubusercontent.com/baguse/directus-flow-recipes/main/catalog.json';

export type RecipeApiClient = AxiosInstance;

export class RecipeSourceService {
  /**
   * Performs an HTTP request either directly or proxied through
   * Directus's /flow-manager-endpoint/flow-manager/process to bypass browser CSP.
   */
  static async requestProxy<T>(
    api: RecipeApiClient | undefined,
    url: string,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      staticToken?: string;
      payload?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const method = options?.method || 'GET';
    const staticToken = options?.staticToken;
    const payload = options?.payload;
    const headers = options?.headers;

    // 1. If Directus api client is provided, proxy through /flow-manager/process to bypass browser CSP
    if (api && typeof api.post === 'function') {
      const res = await api.post<T>(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url,
        method,
        staticToken,
        payload,
        headers,
      });
      return res.data;
    }

    // 2. Direct browser fetch fallback (used if api client not provided, e.g. tests/scripts)
    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
      ...(headers || {}),
    };

    const res = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Retrieves all available recipe summaries across active sources.
   * Remote calls to GitHub and the Go Cloud Hub are proxied through /process to avoid CSP.
   */
  static async listAllRecipes(options?: {
    hubUrl?: string;
    hubToken?: string;
    communityFeedUrl?: string;
    api?: RecipeApiClient;
  }): Promise<FlowRecipeSummary[]> {
    const list: FlowRecipeSummary[] = [];

    // 1. Built-in Offline Starter Recipes
    for (const r of STARTER_RECIPES) {
      list.push({
        id: r.id,
        source: 'builtin',
        name: r.name,
        version: r.version,
        description: r.description,
        category: r.category,
        icon: r.icon,
        color: r.color,
        author: r.author,
        tags: r.tags,
        isPro: r.isPro,
        flowCount: r.flows.length,
      });
    }

    // 2. Local User-Saved / Uploaded Recipes from LocalStorage
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECIPES_KEY);
      if (stored) {
        const localRecipes: IFlowRecipe[] = JSON.parse(stored);
        for (const lr of localRecipes) {
          list.push({
            id: lr.id,
            source: 'local',
            name: lr.name,
            version: lr.version,
            description: lr.description,
            category: lr.category,
            icon: lr.icon,
            color: lr.color,
            author: lr.author,
            tags: lr.tags,
            isPro: false,
            flowCount: lr.flows.length,
          });
        }
      }
    } catch {
      // ignore localStorage parse errors
    }

    // 3. Remote Community GitHub Registry Feed (proxied through /process if api provided)
    const feedUrl = options?.communityFeedUrl || DEFAULT_COMMUNITY_FEED_URL;
    try {
      const remoteCatalog = await this.requestProxy<FlowRecipeSummary[]>(options?.api, feedUrl, {
        method: 'GET',
      });
      if (Array.isArray(remoteCatalog)) {
        for (const item of remoteCatalog) {
          // Avoid duplicate IDs
          if (!list.some((existing) => existing.id === item.id)) {
            list.push({
              ...item,
              source: 'github',
            });
          }
        }
      }
    } catch {
      // Community feed fetch failure (offline or repo not yet live) is non-blocking
    }

    // 4. Dedicated Go Cloud Hub (proxied through /process to avoid CSP)
    if (options?.hubUrl && options?.hubToken) {
      try {
        const hubList = await this.requestProxy<FlowRecipeSummary[]>(
          options?.api,
          `${options.hubUrl}/api/v1/recipes`,
          {
            method: 'GET',
            staticToken: options.hubToken,
          },
        );
        if (Array.isArray(hubList)) {
          for (const item of hubList) {
            list.push({
              ...item,
              source: 'cloud',
            });
          }
        }
      } catch {
        // Hub unreachable is non-blocking
      }
    }

    return list;
  }

  /**
   * Fetches the full executable recipe payload for a given recipe ID.
   * Remote calls to GitHub and Go Cloud Hub are proxied through /process to avoid CSP.
   */
  static async getRecipeById(
    id: string,
    source: RecipeSourceType,
    options?: {
      hubUrl?: string;
      hubToken?: string;
      communityBaseUrl?: string;
      api?: RecipeApiClient;
    },
  ): Promise<IFlowRecipe | null> {
    // 1. Builtin
    if (source === 'builtin') {
      const match = STARTER_RECIPES.find((r) => r.id === id);
      return match ? JSON.parse(JSON.stringify(match)) : null;
    }

    // 2. Local File / Custom
    if (source === 'local') {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_RECIPES_KEY);
        if (stored) {
          const localRecipes: IFlowRecipe[] = JSON.parse(stored);
          const match = localRecipes.find((r) => r.id === id);
          return match ? JSON.parse(JSON.stringify(match)) : null;
        }
      } catch {
        return null;
      }
    }

    // 3. GitHub (proxied through /process to avoid CSP)
    if (source === 'github') {
      try {
        const baseUrl =
          options?.communityBaseUrl ||
          'https://raw.githubusercontent.com/baguse/directus-flow-recipes/main/recipes';
        return await this.requestProxy<IFlowRecipe>(options?.api, `${baseUrl}/${id}.recipe.json`, {
          method: 'GET',
        });
      } catch {
        return null;
      }
    }

    // 4. Go Cloud Hub (proxied through /process to avoid CSP)
    if (source === 'cloud' && options?.hubUrl && options?.hubToken) {
      try {
        return await this.requestProxy<IFlowRecipe>(
          options?.api,
          `${options.hubUrl}/api/v1/recipes/${id}`,
          {
            method: 'GET',
            staticToken: options.hubToken,
          },
        );
      } catch {
        return null;
      }
    }

    // Fallback: search in starter recipes
    const fallback = STARTER_RECIPES.find((r) => r.id === id);
    return fallback ? JSON.parse(JSON.stringify(fallback)) : null;
  }

  /**
   * Tests connection and health status of Go Hub via /flow-manager/process proxy.
   */
  static async testHubConnection(
    hubUrl: string,
    hubToken: string,
    api?: RecipeApiClient,
  ): Promise<{ status: string; version?: string }> {
    return await this.requestProxy(api, `${hubUrl}/health`, {
      method: 'GET',
      staticToken: hubToken,
    });
  }

  /**
   * Publishes a recipe to the Go Cloud Hub via /flow-manager/process proxy.
   */
  static async publishRecipeToHub(
    recipe: IFlowRecipe,
    options: {
      hubUrl: string;
      hubToken: string;
      api?: RecipeApiClient;
    },
  ): Promise<{ message: string; id: string; recipe?: FlowRecipeSummary }> {
    return await this.requestProxy(options.api, `${options.hubUrl}/api/v1/recipes`, {
      method: 'POST',
      staticToken: options.hubToken,
      payload: recipe,
    });
  }

  /**
   * Saves a custom recipe to local storage.
   */
  static saveLocalRecipe(recipe: IFlowRecipe): void {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECIPES_KEY);
      let list: IFlowRecipe[] = stored ? JSON.parse(stored) : [];
      list = list.filter((r) => r.id !== recipe.id);
      list.unshift(recipe);
      localStorage.setItem(LOCAL_STORAGE_RECIPES_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save local recipe:', e);
    }
  }

  /**
   * Deletes a custom recipe from local storage.
   */
  static deleteLocalRecipe(id: string): void {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_RECIPES_KEY);
      if (stored) {
        let list: IFlowRecipe[] = JSON.parse(stored);
        list = list.filter((r) => r.id !== id);
        localStorage.setItem(LOCAL_STORAGE_RECIPES_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.error('Failed to delete local recipe:', e);
    }
  }
}
