<template>
  <NInput
    :value="keyword"
    placeholder="搜索"
    aria-label="搜索"
    clearable
    round
    class="w-70! shrink-0"
    :theme-overrides="{
      border: '1px solid transparent',
      borderHover: `1px solid ${themeVars.borderColor}`,
      borderFocus: `1px solid ${themeVars.primaryColor}`,
    }"
    @update:value="schedule"
    @compositionstart="startComposition"
    @compositionend="endComposition"
    @keydown.enter="handleEnter"
  >
    <template #prefix
      ><NIcon><SearchOutlined /></NIcon
    ></template>
  </NInput>
</template>

<script setup lang="ts">
  import { SearchOutlined } from '@vicons/antd';
  import { readSearchQuery } from '@/utils/search';

  const route = useRoute();
  const router = useRouter();
  const themeVars = useThemeVars();
  const keyword = ref(route.name === 'Search' ? readSearchQuery(route.query).keyword : '');
  let composing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }

  function returnPath() {
    const from = typeof route.query.from === 'string' ? route.query.from : '/home';
    const target = router.resolve(from);
    return from.startsWith('/') &&
      !from.startsWith('//') &&
      target.name !== 'Search' &&
      target.matched.some((record) => record.name === 'Root')
      ? from
      : '/home';
  }

  async function submit() {
    cancel();
    if (composing) return;
    const q = keyword.value.trim();
    if (!q) {
      if (route.name === 'Search') await router.push(returnPath());
      return;
    }
    const searching = route.name === 'Search';
    const query = {
      q,
      type: searching ? readSearchQuery(route.query).type : 0,
      size: searching ? readSearchQuery(route.query).pageSize : 50,
      from: searching ? returnPath() : route.fullPath,
    };
    const navigation = { name: 'Search', query };
    if (searching) await router.replace(navigation);
    else await router.push(navigation);
  }

  function schedule(value: string) {
    keyword.value = value;
    cancel();
    if (composing) return;
    if (!value.trim()) {
      void submit();
      return;
    }
    timer = setTimeout(() => {
      void submit();
    }, 300);
  }

  function handleEnter(event: KeyboardEvent) {
    if (event.isComposing || composing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  }

  function startComposition() {
    composing = true;
    cancel();
  }
  function endComposition(event: CompositionEvent) {
    composing = false;
    schedule((event.target as HTMLInputElement).value);
  }

  watch([() => route.name, () => route.query.q], () => {
    cancel();
    keyword.value = route.name === 'Search' ? readSearchQuery(route.query).keyword : '';
  });
  onScopeDispose(cancel);
</script>
