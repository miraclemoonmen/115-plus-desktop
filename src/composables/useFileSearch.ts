import { ref, watch, onScopeDispose } from 'vue';
import { fileSearch } from '@/api/file';
import type { FileSearchRequestParams, SearchFile } from '@/api/types/file';

/** 搜索串行发送，等待期间只保留最新条件；继续使用接口层统一限速。 */
export function useFileSearch(getQuery: () => FileSearchRequestParams | null) {
  const data = ref<SearchFile[]>([]);
  const count = ref(0);
  const loading = ref(false);
  let version = 0;
  let running = false;
  let pending: { version: number; query: FileSearchRequestParams } | undefined;

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const task = pending;
        pending = undefined;
        try {
          const result = await fileSearch(task.query);
          if (task.version !== version) continue;
          data.value = result.data;
          count.value = Math.min(Number(result.count), 10000);
        } catch {
          // 接口层已统一显示错误；过期请求不回填列表。
        } finally {
          if (task.version === version) loading.value = false;
        }
      }
    } finally {
      running = false;
    }
  }

  function refresh() {
    const query = getQuery();
    version++;
    pending = query?.search_value ? { version, query: { ...query } } : undefined;
    data.value = [];
    count.value = 0;
    loading.value = !!pending;
    void drain();
  }

  watch(() => JSON.stringify(getQuery()), refresh, { immediate: true });
  onScopeDispose(() => {
    version++;
    pending = undefined;
  });
  return { data, count, loading, refresh };
}
