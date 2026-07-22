import { invoke } from "@tauri-apps/api/core";

/**
 * API key 只通过 Rust 命令写入 Windows 当前用户绑定的 DPAPI 存储。
 * 前端可以检查是否存在、覆盖或删除，但不会读取明文 key。
 */
export async function hasApiKey(provider: string): Promise<boolean> {
  return invoke<boolean>("secret_has", { provider });
}

export async function setApiKey(provider: string, key: string): Promise<void> {
  await invoke("secret_set", { provider, secret: key });
}

export async function deleteApiKey(provider: string): Promise<void> {
  await invoke("secret_delete", { provider });
}
