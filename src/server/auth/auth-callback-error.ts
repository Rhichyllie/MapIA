import { AppError, isAppError } from "@/src/lib/app-error";

export const AUTH_CALLBACK_ERROR_STATUS = {
  AuthStorageNotReady: 503,
  AuthStorageMigrationIncomplete: 503,
  AuthStorageIntegrityInvalid: 503,
  AuthIdentityConflict: 409,
  AuthAccessDenied: 403,
  AuthSigninFailed: 500,
} as const;

export type AuthCallbackErrorCode = keyof typeof AUTH_CALLBACK_ERROR_STATUS;

const AUTH_CALLBACK_ERROR_MESSAGE = {
  AuthStorageNotReady:
    "A infraestrutura de autenticacao ainda nao esta pronta neste ambiente.",
  AuthStorageMigrationIncomplete:
    "O rollout de migrations da autenticacao ainda esta incompleto neste ambiente.",
  AuthStorageIntegrityInvalid:
    "A integridade do storage de autenticacao ainda esta invalida neste ambiente.",
  AuthIdentityConflict:
    "A identidade autenticada entrou em conflito com um usuario interno existente.",
  AuthAccessDenied:
    "A autenticacao foi negada pelas regras ativas do MapIA.",
  AuthSigninFailed:
    "O backend de autenticacao falhou antes de concluir o login.",
} as const satisfies Record<AuthCallbackErrorCode, string>;

const callbackErrorCodeSet = new Set<AuthCallbackErrorCode>(
  Object.keys(AUTH_CALLBACK_ERROR_STATUS) as AuthCallbackErrorCode[],
);

export function isAuthCallbackErrorCode(
  value: string | null | undefined,
): value is AuthCallbackErrorCode {
  return Boolean(value) && callbackErrorCodeSet.has(value as AuthCallbackErrorCode);
}

export function getAuthCallbackErrorStatus(code: AuthCallbackErrorCode) {
  return AUTH_CALLBACK_ERROR_STATUS[code];
}

export function getAuthCallbackErrorMessage(code: AuthCallbackErrorCode) {
  return AUTH_CALLBACK_ERROR_MESSAGE[code];
}

function mapAppErrorToCallbackCode(error: AppError): AuthCallbackErrorCode {
  switch (error.code) {
    case "AUTH_STORAGE_NOT_READY":
      return "AuthStorageNotReady";
    case "AUTH_STORAGE_MIGRATION_INCOMPLETE":
      return "AuthStorageMigrationIncomplete";
    case "AUTH_STORAGE_INTEGRITY_INVALID":
      return "AuthStorageIntegrityInvalid";
    case "AUTH_IDENTITY_CONFLICT":
    case "AUTH_EMAIL_CONFLICT":
      return "AuthIdentityConflict";
    case "AUTH_EMAIL_REQUIRED":
    case "AUTH_SUBJECT_REQUIRED":
    case "AUTH_USER_DISABLED":
      return "AuthAccessDenied";
    default:
      return error.status >= 500 ? "AuthSigninFailed" : "AuthAccessDenied";
  }
}

export function toAuthCallbackError(error: unknown) {
  if (isAppError(error)) {
    return new Error(mapAppErrorToCallbackCode(error));
  }

  if (error instanceof Error && isAuthCallbackErrorCode(error.message)) {
    return error;
  }

  return new Error("AuthSigninFailed");
}
