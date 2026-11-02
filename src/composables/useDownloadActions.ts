import { open } from '@tauri-apps/plugin-dialog';
import type { MyFile } from '@/api/types/file';
import { assertDownloadName } from '@/utils/downloadPath';
import { useSettingStore } from '@/store/setting';
import { useDownloadManager } from './useDownloadManager';

export function useDownloadActions() {
  const message = useMessage();
  const settingStore = useSettingStore();
  const { download: downloadFile, batchDownload: batchDownloadFiles } = useDownloadManager();
  const handleDownload = async (file: MyFile) => {
    try {
      let targetPath: string | undefined;
      if (settingStore.downloadSetting.askSavePath) {
        assertDownloadName(file.fn);
        const dir = await open({
          directory: true,
          multiple: false,
          title: '选择保存目录',
          defaultPath: settingStore.downloadSetting.downloadPath || undefined,
        });
        if (!dir) return;
        targetPath = `${dir}/${file.fn}`;
      }
      message.info('正在获取下载链接，可在下载列表中查看下载进度');
      await downloadFile(file, targetPath);
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : '下载任务添加失败');
    }
  };

  const handleBatchDownload = async (files: MyFile[]) => {
    if (files.length === 0) return;
    try {
      let targetDir: string | undefined;
      if (settingStore.downloadSetting.askSavePath) {
        const dir = await open({
          directory: true,
          multiple: false,
          title: '选择保存目录',
          defaultPath: settingStore.downloadSetting.downloadPath || undefined,
        });
        if (!dir) return;
        targetDir = dir;
      }
      message.info(`正在添加 ${files.length} 个文件到下载队列，可在下载列表中查看进度`);
      await batchDownloadFiles(files, targetDir);
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : '批量下载任务添加失败');
    }
  };

  return { handleDownload, handleBatchDownload };
}
