<template>
  <NEl class="h-full flex flex-col text-(--text-color-2)" aria-label="搜索结果">
    <ExplorerToolbarLayout>
      <NRadioGroup
        :value="state.type"
        size="small"
        aria-label="文件分类"
        @update:value="changeType"
      >
        <NRadioButton v-for="option in searchTypes" :key="option.value" :value="option.value">{{
          option.label
        }}</NRadioButton>
      </NRadioGroup>
    </ExplorerToolbarLayout>
    <FileExplorer
      :search-source="{ params: query, active: route.name === 'Search' }"
      :columns="['size', 'createTime', 'modifyTime']"
      :toolbar="['refresh', 'download', 'copy', 'move', 'rename', 'delete']"
      :context-menu="contextActions"
      :show-breadcrumb="false"
      class="flex-1 min-h-0"
      defer-navigation
      @search-page-change="changePage"
      @search-size-change="changeSize"
      @navigate-request="handleOpenFolder"
      @open-location="(file) => handleOpenFolder(file.pid, file.fid)"
      @open-file="handleOpenFile"
      @download="handleDownload"
      @batch-download="handleBatchDownload"
    >
      <template #name="{ item }">
        <a
          href="#"
          class="text-inherit no-underline"
          :aria-busy="openingId === item.fid"
          @click.prevent.stop="openItem(item)"
        >
          <NHighlight :text="item.fn" :patterns="[state.keyword]" auto-escape />
        </a>
      </template>
    </FileExplorer>
  </NEl>
</template>

<script setup lang="ts">
  import type { MyFile } from '@/api/types/file';
  import { isNavigationFailure, NavigationFailureType } from 'vue-router';
  import FileExplorer from '@/components/FileExplorer/FileExplorer.vue';
  import ExplorerToolbarLayout from '@/components/FileExplorer/components/ExplorerToolbarLayout/ExplorerToolbarLayout.vue';
  import { fileContextMenuActions, type ContextMenuAction } from '@/components/FileExplorer/types';
  import { readSearchQuery, searchParams, searchTypes } from '@/utils/search';
  import { useFilePreview } from '@/composables/useFilePreview';
  import { useDownloadActions } from '@/composables/useDownloadActions';

  const route = useRoute();
  const router = useRouter();
  const message = useMessage();
  const { openFile } = useFilePreview();
  const { handleDownload, handleBatchDownload } = useDownloadActions();
  const state = computed(() => readSearchQuery(route.query));
  const query = computed(() => searchParams(route.query));
  const openingId = ref<string | null>(null);
  const contextActions: ContextMenuAction[] = [
    ...fileContextMenuActions.filter((action) => action !== 'uploadFile'),
    'openLocation',
  ];

  function updateQuery(patch: Record<string, number>) {
    return router.replace({ name: 'Search', query: { ...route.query, ...patch } });
  }
  function changeType(type: number) {
    void updateQuery({ type, page: 1 });
  }
  function changePage(page: number) {
    void updateQuery({ page });
  }
  function changeSize(size: number) {
    void updateQuery({ size, page: 1 });
  }

  const handleOpenFolder = async (folderId: string | number, targetId?: string) => {
    const cid = String(folderId ?? '').trim();
    if (!cid) {
      message.error('打开目录失败');
      return;
    }
    try {
      const failure = await router.push({
        name: 'Home',
        query: { ...(cid === '0' ? {} : { fid: cid }), ...(targetId ? { locate: targetId } : {}) },
      });
      if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) throw failure;
      const destination = router.currentRoute.value;
      if (destination.name !== 'Home' || String(destination.query.fid ?? '0') !== cid)
        message.error('打开目录失败');
    } catch {
      message.error('打开目录失败');
    }
  };

  async function handleOpenFile(file: MyFile) {
    if (openingId.value || !state.value.keyword) return;
    openingId.value = file.fid;
    try {
      await openFile(
        { ...file, isv: state.value.type === 4 ? 1 : undefined },
        { kind: 'search', params: { ...query.value } },
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件打开失败');
    } finally {
      openingId.value = null;
    }
  }
  function openItem(file: MyFile) {
    if (file.fc === '0') void handleOpenFolder(file.fid);
    else void handleOpenFile(file);
  }
</script>
