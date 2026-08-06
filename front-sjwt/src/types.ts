/**
 * 백엔드(securityJWT)와의 계약.
 * 필드 이름은 securityJWT/docs/1-SPEC.md 의 F1 응답과 1:1로 맞춘다.
 * 여기를 바꾸려면 SPEC 부터 고쳐야 한다.
 */

/** F1. 로그인 성공 응답 */
export interface LoginResponse {
  email: string;
  nickname: string;
  social: boolean;
  roleNames: string[];
  accessToken: string;
  refreshToken: string;
}

/** F5. 토큰 갱신 응답 */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * F7. 에러 응답.
 * 백엔드는 필터/핸들러에서는 `error`, ControllerAdvice에서는 `msg` 키를 쓴다.
 */
export interface ErrorResponse {
  error?: string;
  msg?: string;
}

/** F7. 에러 코드 — 백엔드가 내려주는 문자열 전체 목록 */
export const ERROR_CODES = {
  MALFORMED: 'MalFormed',
  EXPIRED: 'Expired',
  INVALID: 'Invalid',
  JWT_ERROR: 'JWTError',
  ERROR: 'Error',
  NULL_REFRESH: 'NULL_REFRASH', // 백엔드 오타지만 계약이므로 그대로 쓴다
  INVALID_STRING: 'INVALID_STRING',
  LOGIN_FAIL: 'ERROR_LOGIN',
  ACCESS_TOKEN: 'ERROR_ACCESS_TOKEN',
  ACCESS_DENIED: 'ERROR_ACCESSDENIED',
} as const;

/**
 * accessToken payload — JWTUtil이 심는 claims.
 * 비밀번호는 담기지 않는다. payload는 서명될 뿐 암호화되지 않기 때문이다.
 */
export interface JwtClaims {
  email: string;
  nickname: string;
  social: boolean;
  roleNames: string[];
  iat: number;
  exp: number;
}

/** 화면 로그 한 줄 */
export interface LogEntry {
  id: number;
  time: string;
  title: string;
  status: number | null;
  body: string;
  ok: boolean;
}
