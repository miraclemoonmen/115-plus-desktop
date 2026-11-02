<template>
  <NLayout content-class="min-h-screen">
    <div class="flex justify-center items-center pt-44">
      <NCard hoverable class="w-80! h-80!">
        <div class="flex flex-col items-center justify-center h-full">
          <div class="w-55 h-55 relative">
            <NQrCode
              v-if="qrCodeData.qrcode"
              :value="qrCodeData.qrcode"
              :size="196"
              error-correction-level="H"
            />
            <div
              v-if="isCencel"
              class="absolute top-0 w-full h-full flex flex-col justify-center items-center backdrop-blur-sm font-bold text-xl cursor-pointer"
              :style="{
                color: themeVars.errorColor,
              }"
              @click="init"
            >
              <div>已取消登录</div>
              <div>请点击刷新</div>
            </div>
            <div
              v-if="isScanSuccess"
              class="absolute top-0 w-full h-full flex flex-col justify-center items-center backdrop-blur-sm font-bold text-xl cursor-pointer"
              :style="{
                color: themeVars.successColor,
              }"
            >
              <div>扫描成功</div>
              <div>请在手机点确认以登录</div>
            </div>
            <div
              v-if="isQrCodeExpired"
              class="absolute top-0 w-full h-full flex flex-col justify-center items-center backdrop-blur-sm font-bold text-xl cursor-pointer"
              :style="{
                color: themeVars.errorColor,
              }"
              @click="init"
            >
              <div>二维码失效</div>
              <div>请点击刷新</div>
            </div>
          </div>

          <div class="mt-2">使用 115APP 扫一扫登录</div>
          <NButton text type="primary" :disabled="isInitializing" @click="init">
            刷新二维码
          </NButton>
        </div>
      </NCard>
    </div>
    <div v-if="loginError" class="max-w-120 mx-auto mt-4 px-4">
      <NAlert type="error" title="登录未完成">{{ loginError }}</NAlert>
    </div>
  </NLayout>
</template>

<script setup lang="ts">
  import type { AuthDeviceCodeResponseData } from '@/api/types/user';
  import { authDeviceCode, deviceCodeToToken, qrCodeStatus } from '@/api/user';
  import { delay, randomInt } from 'es-toolkit';

  const themeVars = useThemeVars();
  const codeVerifier = ref('');
  const codeChallenge = ref('');
  const clientId = import.meta.env.VITE_APP_ID;
  const qrCodeData = ref<AuthDeviceCodeResponseData>({
    qrcode: '',
    uid: '',
    sign: '',
    time: 0,
  });
  const isQrCodeExpired = ref(false);
  const isScanSuccess = ref(false);
  const isCencel = ref(false);
  const isInitializing = ref(false);
  const loginError = ref('');
  let loginGeneration = 0;
  let pendingStatus: ReturnType<typeof qrCodeStatus> | undefined;
  const message = useMessage();
  const router = useRouter();

  onMounted(() => {
    void init();
  });

  onUnmounted(() => {
    loginGeneration++;
    pendingStatus?.abort();
  });

  const showLoginError = (error: unknown) => {
    const detail = error as { code?: number; message?: string; error?: string };
    const text = detail?.message || detail?.error || '网络请求失败，请刷新二维码重试';
    loginError.value = detail?.code ? `${text}（错误码 ${detail.code}）` : text;
    console.warn('[login]', { step: 'failed', code: detail?.code, message: text });
  };

  const init = async () => {
    if (isInitializing.value) return;
    const generation = ++loginGeneration;
    pendingStatus?.abort();
    loginError.value = '';
    isScanSuccess.value = false;
    isQrCodeExpired.value = false;
    isCencel.value = false;
    isInitializing.value = true;
    try {
      await getCodeChallenge();
      await getQrCodeData();
      if (generation === loginGeneration) void getQrCodeStatus(generation);
    } catch (error) {
      if (generation === loginGeneration) showLoginError(error);
    } finally {
      isInitializing.value = false;
    }
  };

  const getCodeChallenge = async () => {
    codeVerifier.value = generateRandomString(randomInt(43, 128));
    codeChallenge.value = await generateCodeChallenge();
  };

  const getQrCodeData = async () => {
    const res = await authDeviceCode({
      client_id: clientId,
      code_challenge: codeChallenge.value,
      code_challenge_method: 'sha256',
    });
    qrCodeData.value = res.data;
    isQrCodeExpired.value = false;
    isScanSuccess.value = false;
  };

  const getQrCodeStatus = async (generation: number) => {
    let failures = 0;
    try {
      while (generation === loginGeneration) {
        pendingStatus = qrCodeStatus({
          uid: qrCodeData.value.uid,
          sign: qrCodeData.value.sign,
          time: qrCodeData.value.time,
        });
        let res;
        try {
          res = await pendingStatus;
        } catch (error) {
          if (generation !== loginGeneration) return;
          // 状态查询是长轮询，短暂网络中断后继续查询同一个二维码。
          // 业务错误（如二维码失效）交给外层处理，不重试。
          if ((error !== null && typeof error === 'object' && 'state' in error) || ++failures > 3)
            throw error;
          await delay(1000);
          continue;
        }
        if (generation !== loginGeneration) return;
        failures = 0;
        console.info('[login]', { step: 'scan-status', status: res.data.status ?? 0 });
        if (!res.data.status) continue;
        if (res.data.status === 1) {
          isScanSuccess.value = true;
        } else if (res.data.status === 2) {
          console.info('[login]', { step: 'exchange-token' });
          await getToken();
          if (generation !== loginGeneration) return;
          message.success('登录成功！');
          await router.replace({ name: 'Home' });
          return;
        } else {
          isScanSuccess.value = false;
          isCencel.value = true;
          return;
        }
      }
    } catch (error) {
      if (generation !== loginGeneration) return;
      isScanSuccess.value = false;
      if ((error as { code?: number })?.code === 40199002) {
        isQrCodeExpired.value = true;
      } else {
        showLoginError(error);
      }
    }
  };

  const getToken = async () => {
    await deviceCodeToToken({
      uid: qrCodeData.value.uid,
      code_verifier: codeVerifier.value,
    });
  };

  const generateRandomString = (length: number) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(randomInt(0, charactersLength - 1));
    }
    return result;
  };

  const sha256 = async (plain: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return hash;
  };

  const base64urlencode = (buffer: ArrayBuffer) => {
    const base64String = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return base64String;
  };

  const generateCodeChallenge = async () => {
    const hashed = await sha256(codeVerifier.value);
    return base64urlencode(hashed);
  };
</script>

<style scoped></style>
