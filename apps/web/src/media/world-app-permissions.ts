"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import { Permission } from "@worldcoin/minikit-js/commands";
import type { MessageKey } from "@/i18n/messages";

const WORLD_APP_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
  audio: true,
};

type PermissionName = Permission.Microphone | Permission.Notifications;

export type WorldAppPermissionResult =
  | { granted: true }
  | { granted: false; messageKey: MessageKey };

export type WorldAppMediaStreamResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; messageKey: MessageKey };

function isInstalled() {
  try {
    return MiniKit.isInstalled();
  } catch {
    return false;
  }
}

function isPermissionGranted(value: unknown) {
  return value === true || value === "granted";
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "error_code" in error) {
    const code = (error as { error_code?: unknown }).error_code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function permissionErrorMessageKey(
  permission: PermissionName,
  error: unknown,
): MessageKey {
  const code = getErrorCode(error);
  if (permission === Permission.Notifications) {
    switch (code) {
      case "user_rejected":
      case "already_requested":
        return "notifications.rejected";
      case "permission_disabled":
        return "notifications.disabled";
      case "unsupported_permission":
        return "notifications.unsupported";
      case "already_granted":
        return "notifications.enabled";
      default:
        return "notifications.failed";
    }
  }

  switch (code) {
    case "user_rejected":
    case "already_requested":
      return "recorder.microphoneRejected";
    case "permission_disabled":
    case "world_app_permission_not_enabled":
      return "recorder.microphoneDisabled";
    case "unsupported_permission":
      return "recorder.microphoneUnsupported";
    case "already_granted":
      return "recorder.microphoneReady";
    default:
      return "recorder.microphoneFailed";
  }
}

async function getPermission(permission: PermissionName) {
  const result = await MiniKit.getPermissions();
  if (!("permissions" in result.data)) {
    return false;
  }
  return isPermissionGranted(result.data.permissions?.[permission]);
}

async function ensureWorldAppPermission(
  permission: PermissionName,
): Promise<WorldAppPermissionResult> {
  if (!isInstalled()) {
    return { granted: false, messageKey: "provider.worldAppWalletAuth" };
  }

  try {
    if (await getPermission(permission)) {
      return { granted: true };
    }
  } catch {
    // Continue to request the permission. World App can still return a precise
    // request-time error if permission state could not be fetched.
  }

  try {
    await MiniKit.requestPermission({ permission });
    return { granted: true };
  } catch (error) {
    return {
      granted: false,
      messageKey: permissionErrorMessageKey(permission, error),
    };
  }
}

export async function ensureWorldAppMicrophonePermission() {
  return ensureWorldAppPermission(Permission.Microphone);
}

export async function ensureWorldAppNotificationPermission() {
  return ensureWorldAppPermission(Permission.Notifications);
}

export async function getWorldAppMicrophonePermissionStatus(): Promise<WorldAppPermissionResult> {
  if (!isInstalled()) {
    return { granted: false, messageKey: "provider.worldAppWalletAuth" };
  }

  try {
    return (await getPermission(Permission.Microphone))
      ? { granted: true }
      : { granted: false, messageKey: "recorder.microphoneDisabled" };
  } catch {
    return { granted: false, messageKey: "recorder.microphoneFailed" };
  }
}

export async function getWorldAppNotificationPermissionStatus(): Promise<WorldAppPermissionResult> {
  if (!isInstalled()) {
    return { granted: false, messageKey: "provider.worldAppWalletAuth" };
  }

  try {
    return (await getPermission(Permission.Notifications))
      ? { granted: true }
      : { granted: false, messageKey: "notifications.notEnabled" };
  } catch {
    return { granted: false, messageKey: "notifications.failed" };
  }
}

export async function getWorldAppPermissionStatuses(): Promise<{
  notifications: WorldAppPermissionResult;
  audio: WorldAppPermissionResult;
}> {
  if (!isInstalled()) {
    const unavailable = {
      granted: false as const,
      messageKey: "provider.worldAppWalletAuth" as const,
    };
    return { notifications: unavailable, audio: unavailable };
  }

  try {
    const result = await MiniKit.getPermissions();
    const permissions =
      "permissions" in result.data ? result.data.permissions : undefined;
    return {
      notifications: isPermissionGranted(permissions?.[Permission.Notifications])
        ? { granted: true }
        : { granted: false, messageKey: "notifications.notEnabled" },
      audio: isPermissionGranted(permissions?.[Permission.Microphone])
        ? { granted: true }
        : { granted: false, messageKey: "recorder.microphoneDisabled" },
    };
  } catch {
    return {
      notifications: { granted: false, messageKey: "notifications.failed" },
      audio: { granted: false, messageKey: "recorder.microphoneFailed" },
    };
  }
}

export async function openWorldAppCameraStream(): Promise<WorldAppMediaStreamResult> {
  const microphone = await ensureWorldAppMicrophonePermission();
  if (!microphone.granted) {
    return { ok: false, messageKey: microphone.messageKey };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, messageKey: "recorder.cameraUnavailable" };
  }

  try {
    return {
      ok: true,
      stream: await navigator.mediaDevices.getUserMedia(
        WORLD_APP_CAMERA_CONSTRAINTS,
      ),
    };
  } catch {
    return { ok: false, messageKey: "recorder.cameraDenied" };
  }
}
