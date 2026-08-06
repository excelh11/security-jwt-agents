# 1. SPEC — 무엇을? (필수 기능에 대한 설명)

> 이 문서는 프로젝트의 **Spring Security + JWT 인증/인가 체계가 반드시 만족해야 하는 기능 명세**다.
> 모든 코드 변경은 이 명세를 깨뜨리지 않아야 한다. 명세를 바꿔야 한다면 **코드보다 이 문서를 먼저 고친다.**

---

## 0. 대상 시스템

- 프론트엔드(React 등)와 분리된 **REST API 서버**. 화면 이동(redirect)이 없고 모든 응답은 JSON이다.
- 서버 포트: **8080** (`server.port=8080`)
- 인증 상태를 서버가 들고 있지 않는 **완전 무상태(stateless)** 구조.
- 검증용 프론트엔드는 **별도 프로젝트**다 → `../front-sjwt` (Vite + React + TypeScript).

```
front-sjwt (Vite dev server :5173)          securityJWT (Spring Boot :8080)
        │                                            │
        │  fetch + Authorization: Bearer …           │
        └────────── cross-origin ────────────────────┘
                    ↑ 여기서 F6(CORS)이 실제로 작동한다
```

> 프론트가 **다른 오리진**이므로 preflight(OPTIONS)와 CORS 헤더가 실제로 오간다.
> Vite proxy를 쓰면 same-origin이 되어 CORS를 우회하게 되므로, **F6를 검증하려면 proxy 없이 절대 URL로 호출**해야 한다.

### 관련 소스 지도

| 역할                     | 파일                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| 시큐리티 필터체인 / CORS | `src/main/java/com/securityjwt/config/CustomSecurityConfig.java`                                         |
| JWT 생성·검증            | `src/main/java/com/securityjwt/util/JWTUtil.java`                                                        |
| JWT 예외                 | `src/main/java/com/securityjwt/util/CustomJWTException.java`                                             |
| 토큰 검사 필터           | `src/main/java/com/securityjwt/security/filter/JWTCheckFilter.java`                                      |
| 로그인 성공/실패         | `src/main/java/com/securityjwt/security/handler/APILoginSuccessHandler.java`, `APILoginFailHandler.java` |
| 접근 거부                | `src/main/java/com/securityjwt/security/handler/CustomAccessDeniedHandler.java`                          |
| 사용자 조회              | `src/main/java/com/securityjwt/security/CustomUserDetailsService.java`                                   |
| 인증 주체(Principal)     | `src/main/java/com/securityjwt/dto/MemberDTO.java`                                                       |
| 토큰 갱신                | `src/main/java/com/securityjwt/controller/APIRefreshController.java`                                     |
| 예외 → HTTP 응답         | `src/main/java/com/securityjwt/controller/advice/CustomControllerAdvice.java`                            |
| MVC 포맷터 (CORS 아님)   | `src/main/java/com/securityjwt/config/CustomServletConfig.java`                                          |
| 검증용 프론트엔드        | `../front-sjwt/` (별도 프로젝트 · Vite + React + TS)                                          |

---

## F1. 로그인 & 토큰 발급

| 항목       | 내용                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 엔드포인트 | `POST /api/member/login`                                                                                     |
| 요청       | `application/x-www-form-urlencoded`, 파라미터 `username`(이메일), `password`                                 |
| 처리       | Spring Security `formLogin` → `CustomUserDetailsService.loadUserByUsername()` → `BCryptPasswordEncoder` 비교 |
| 성공       | `APILoginSuccessHandler`가 **JSON 본문** 반환                                                                |
| 실패       | `APILoginFailHandler` → **401** + `{"error":"ERROR_LOGIN"}`                                                  |

**성공 응답 필드 (프론트와의 계약 — 임의 변경 금지)**

```json
{
  "email": "user1@aaa.com",
  "nickname": "USER1",
  "social": false,
  "roleNames": ["USER"],
  "accessToken": "eyJ0eXAiOiJKV1Qi...",
  "refreshToken": "eyJ0eXAiOiJKV1Qi..."
}
```

> **`pw`는 응답에도 claims에도 넣지 않는다.** JWT payload는 서명될 뿐 암호화되지 않아
> Base64 디코딩만으로 읽힌다. 비밀번호 해시를 실으면 토큰을 가진 누구나 오프라인 대입을 시도할 수 있다.
> claims에는 **인가에 필요한 최소한**(식별자 · 권한 · 유효시간)만 담는다.

**토큰 유효시간**

| 토큰         | 유효시간            | 발급 위치                              |
| ------------ | ------------------- | -------------------------------------- |
| accessToken  | **10분**            | `JWTUtil.generateToken(claims, 10)`    |
| refreshToken | **1440분 (24시간)** | `JWTUtil.generateToken(claims, 60*24)` |

- 리다이렉트를 사용하지 않는다. `defaultSuccessUrl`, `failureUrl` 금지.
- `loginPage("/api/member/login")`은 로그인 **처리 URL** 역할을 겸한다.

---

## F2. 세션리스(Stateless) 인증

- `SessionCreationPolicy.STATELESS` — 서버는 `HttpSession`에 인증 정보를 저장하지 않는다.
- `csrf().disable()` — 세션/쿠키 기반이 아니므로 CSRF 토큰이 불필요하다.
- 매 요청의 인증 주체는 **오직 `Authorization: Bearer <accessToken>` 헤더**로만 결정된다.
- 서버 재시작·스케일아웃 후에도 기존 토큰이 그대로 동작해야 한다.

---

## F3. 토큰 검사 필터 (`JWTCheckFilter`)

- `OncePerRequestFilter`를 상속하고, `UsernamePasswordAuthenticationFilter` **앞에** 등록된다.

### 검사 제외 대상 (`shouldNotFilter()` → `true`)

| 조건                                | 이유                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| HTTP 메서드가 `OPTIONS`             | CORS preflight는 인증 헤더 없이 온다                          |
| URI가 `/api/member/` 로 시작        | 로그인·회원가입·refresh는 토큰이 없거나 만료 상태로 호출된다  |
| URI가 `/api/sample/public` 로 시작 | 상품 이미지 조회는 `<img src>`로 호출되어 헤더를 실을 수 없다 |

### 검사 통과 시

1. `Authorization` 헤더에서 `Bearer ` 접두어를 떼고 accessToken 추출
2. `JWTUtil.validateToken()`으로 claims 획득
3. claims(`email`, `nickname`, `social`, `roleNames`)로 `MemberDTO` 복원
   ※ `social`은 `Boolean`으로 꺼내 `booleanValue()`를 호출하므로 **claims에서 빠지면 NPE**가 난다. 4개 모두 유지할 것.
   ※ 비밀번호는 claims에 없다. `MemberDTO`의 `pw` 자리에는 빈 문자열을 넣고,
   `UsernamePasswordAuthenticationToken`의 credentials에는 **`null`**을 넣는다 —
   인증이 이미 끝난 뒤이므로 자격증명을 들고 있을 이유가 없다.
4. `UsernamePasswordAuthenticationToken`을 만들어 `SecurityContextHolder`에 저장
5. `filterChain.doFilter()` 로 다음 필터 진행

### 검사 실패 시

- **HTTP 401** + `{"error":"ERROR_ACCESS_TOKEN"}` JSON 반환
- **체인을 진행시키지 않는다** (컨트롤러가 실행되면 안 된다)
- 헤더가 `null`이거나 `Bearer ` 접두어가 없으면 `substring(7)` **이전에** 걸러내고 `log.warn`으로 원인을 남긴다

---

## F4. 인가(권한 체크)

- `@EnableMethodSecurity` 기반의 **메서드 단위 인가**를 사용한다.
- 컨트롤러 메서드에 `@PreAuthorize("hasRole('ADMIN')")`, `@PreAuthorize("hasAnyRole('USER','ADMIN')")` 등을 붙인다.
- **`ROLE_` 접두어 규칙**
  - JWT claims의 `roleNames`에는 접두어를 **넣지 않는다** → `["USER"]`
  - `MemberDTO` 생성자가 `"ROLE_" + str`로 `SimpleGrantedAuthority`를 만든다 → `ROLE_USER`
  - `@PreAuthorize`의 SpEL `hasRole()`은 인자가 `ROLE_`로 **시작하지 않을 때만** 접두어를 붙인다.
    따라서 `hasRole('ADMIN')` 과 `hasRole('ROLE_ADMIN')` 은 **둘 다 `ROLE_ADMIN`으로 동작한다.**
    현재 코드는 두 형태가 섞여 있다 — `ProductController:75`는 `hasRole('ROLE_ADMIN')`, `CartController:37`은 `hasAnyRole('ROLE_USER')`.
  - ⚠️ 단, `authorizeHttpRequests` DSL의 `hasRole()`은 `ROLE_` 접두어를 넣으면 **예외를 던진다.** URL 레벨 인가를 도입할 때(K7)는 접두어 없이 써야 한다.
- 권한 부족 시 `CustomAccessDeniedHandler` → HTTP **403** + `{"error":"ERROR_ACCESSDENIED"}`

### 현재 인가가 걸린 엔드포인트 (테스트 기준점)

| 엔드포인트 | 인가 | USER 계정으로 호출하면 |
|---|---|---|
| `GET /api/sample/public` | 없음 (필터 제외 경로) | 200 · 토큰 없이도 통과 |
| `GET /api/sample/user` | 없음 (JWT만) | 200 · 인증 주체 반환 |
| `GET /api/sample/list` | 없음 (JWT만) | 200 |
| `GET /api/sample/admin` | `hasRole('ADMIN')` | **403** `ERROR_ACCESSDENIED` |

> `SampleController`는 비즈니스 로직이 없는 **검증 전용** 컨트롤러다.
> 실제 비즈니스 API(`/api/todo/**`, `/api/products/**` 등) 자리를 대신한다.

---

## F5. 토큰 갱신 (`/api/member/refresh`)

| 항목          | 내용                                          |
| ------------- | --------------------------------------------- | ------------------------- |
| 엔드포인트    | `GET                                          | POST /api/member/refresh` |
| 요청 헤더     | `Authorization: Bearer <accessToken>`         |
| 요청 파라미터 | `refreshToken` (쿼리 스트링)                  |
| 응답          | `{"accessToken":"...", "refreshToken":"..."}` |

### 판정 로직

1. `refreshToken`이 없으면 → `CustomJWTException("NULL_REFRASH")`
2. `Authorization` 헤더가 없거나 길이 7 미만이면 → `CustomJWTException("INVALID_STRING")`
3. accessToken이 **아직 유효**하면 → 기존 토큰 쌍을 그대로 반환 (불필요한 재발급 방지)
4. accessToken이 만료됐으면 → refreshToken을 검증하고 **새 accessToken(10분)** 발급
5. refreshToken 잔여시간이 **60분 미만**이면 → refreshToken도 새로 발급 **(rotation)**, 아니면 기존 것 유지

---

## F6. CORS

- CORS 설정은 **`CustomSecurityConfig.corsConfigurationSource()` 한 곳에서만** 한다.
- `CustomServletConfig`의 `addCorsMappings()`는 **의도적으로 주석 처리**되어 있다.
  시큐리티 필터체인이 MVC보다 앞서므로, MVC에 CORS를 걸면 preflight가 시큐리티 단계에서 먼저 차단된다.
  **되살리지 말 것.**

| 항목                    | 값                                           |
| ----------------------- | -------------------------------------------- |
| Allowed Origin Patterns | `*`                                          |
| Allowed Methods         | `HEAD, GET, POST, PUT, DELETE`               |
| Allowed Headers         | `Authorization, Cache-Control, Content-Type` |
| Allow Credentials       | `true`                                       |
| 적용 경로               | `/**`                                        |

- 프론트에서 새 헤더나 메서드(`PATCH` 등)가 필요해지면 **이 Bean만** 수정한다.

> **Vite proxy를 켜면 브라우저 입장에서 same-origin이 되어 CORS가 검증되지 않는다.**
> `front-sjwt`는 **절대 URL(`http://localhost:8080/api/...`)로 직접 호출**하도록 만든다. 그래야 F6가 실제로 동작하는지 확인된다.

---

## F7. 예외 → 응답 규약

`CustomJWTException`의 메시지 문자열은 **프론트엔드가 분기에 사용하는 계약**이다.

| 코드                 | 발생 지점                   | 의미                       | HTTP  |
| -------------------- | --------------------------- | -------------------------- | ----- |
| `MalFormed`          | `JWTUtil.validateToken`     | 토큰 형식 오류             | 401   |
| `Expired`            | `JWTUtil.validateToken`     | 유효시간 만료              | 401   |
| `Invalid`            | `JWTUtil.validateToken`     | claim 검증 실패            | 401   |
| `JWTError`           | `JWTUtil.validateToken`     | 그 외 JWT 라이브러리 오류  | 401   |
| `Error`              | `JWTUtil.validateToken`     | 알 수 없는 오류            | 401   |
| `NULL_REFRASH`       | `APIRefreshController`      | refreshToken 파라미터 누락 | — ※   |
| `INVALID_STRING`     | `APIRefreshController`      | Authorization 헤더 이상    | 401   |
| `ERROR_LOGIN`        | `APILoginFailHandler`       | 로그인 실패                | 401   |
| `ERROR_ACCESS_TOKEN` | `JWTCheckFilter`            | accessToken 검증 실패      | 401   |
| `ERROR_ACCESSDENIED` | `CustomAccessDeniedHandler` | 권한 부족                  | 403   |

> **기존 문자열을 변경·삭제하지 않는다. 추가만 허용한다.**
> (`NULL_REFRASH`는 오타지만 프론트가 이미 이 값을 쓰고 있으므로 고치지 않는다.)
>
> ※ **`NULL_REFRASH`는 실제로 나오지 않는다.** `@RequestParam("refreshToken")`이 필수(기본값)라
> 파라미터가 빠지면 메서드 진입 전에 `MissingServletRequestParameterException` → **400**이 나간다.
> 컨트롤러 안의 `null` 검사는 도달하지 않는 코드다. `@RequestHeader("Authorization")`도 마찬가지로,
> 헤더가 아예 없으면 `INVALID_STRING`이 아니라 400이다. *(실제 서버 응답으로 확인)*

---

## F8. 검증용 프론트엔드 (`front-sjwt`)

**로그인과 JWT 동작만** 확인하는 최소 프론트엔드. 쇼핑몰 기능(상품·장바구니)은 다루지 않는다.

| 항목 | 내용 |
|---|---|
| 위치 | `../front-sjwt/` (securityJWT와 **별도 프로젝트**) |
| 스택 | Vite + React 18 + TypeScript |
| 개발 서버 | `http://localhost:5173` |
| API 서버 | `http://localhost:8080` — **절대 URL로 직접 호출** (proxy 미사용) |
| 토큰 보관 | `localStorage` (`sjwt_access`, `sjwt_refresh`) |

### 필수 동작

- **F8-1** 로그인 폼 → `POST /api/member/login` (form-urlencoded) 후 두 토큰을 저장한다.
- **F8-2** accessToken의 payload(claims)와 **만료까지 남은 시간**을 화면에 표시한다.
- **F8-3** 아래 호출을 버튼으로 제공하고, 각 버튼에 **기대 결과를 함께 표시**한다.
  | 버튼 | 검증 대상 |
  |---|---|
  | 토큰 O로 보호 API 호출 | F3 정상 통과 |
  | 토큰 X로 보호 API 호출 | F3 `ERROR_ACCESS_TOKEN` |
  | 위조 토큰으로 호출 | F3 서명 검증 |
  | ADMIN 전용 API 호출 | F4 `403 ERROR_ACCESSDENIED` |
  | refresh 호출 / 파라미터 없이 호출 | F5, F7 `NULL_REFRASH` |
- **F8-4** accessToken의 `exp`를 과거로 조작하는 **강제 만료** 버튼을 제공한다.
  서명이 깨지므로 서버는 이를 거부해야 하며, refresh 호출로 복구되어야 한다.
- **F8-5** 모든 요청의 **HTTP 상태코드와 응답 본문 원문**을 로그 영역에 누적 표시한다.
  (K2/K3 때문에 에러도 200으로 오는 현상을 눈으로 확인할 수 있어야 한다.)

### 제약

- **토큰을 쿠키·세션으로 주고받지 않는다.** F2(무상태)를 깨면 안 된다.
- **Vite proxy를 쓰지 않는다.** proxy를 켜면 same-origin이 되어 F6(CORS)이 검증되지 않는다.
- 백엔드의 **에러 코드 문자열(F7)로 분기**한다. HTTP 상태코드로 분기하면 K2/K3 때문에 동작하지 않는다.
- 이 프로젝트는 **백엔드를 바꾸지 않는다.** 프론트에서 불편한 점이 나오면 SPEC 변경으로 올린다.

---

## 🔴 현재 코드의 알려진 결함 (Known Issues)

아래는 **명세 위반이지만 현재 코드에 남아 있는 항목**이다.
해당 파일을 수정하게 되면 사용자에게 알리고 **승인을 받은 뒤** 함께 고친다. 임의로 대량 리팩터링하지 않는다.

| #   | 위치                        | 문제                                                                             | 영향                                                               |
| --- | --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| K4  | `JWTUtil:21`                | 시크릿 키가 **소스에 하드코딩**                                                  | 공개 저장소의 **예시 키로 간주**한다. 실서비스에서는 반드시 외부화 |
| K6  | `JWTUtil` 전반              | jjwt 0.11.5의 deprecated API(`setClaims`, `parserBuilder`, `setExpiration`) 사용 | 라이브러리 업그레이드 시 일괄 수정 필요                            |
| K7  | `CustomSecurityConfig`      | `authorizeHttpRequests` 미설정 — URL 레벨 인가 없음                              | 보호가 전적으로 `@PreAuthorize`에 의존                             |
| K8  | `APIRefreshController:71`   | `checkExpiredToken()`이 `"Expired"`만 만료로 본다                                | **형식이 깨진 토큰을 "아직 유효"로 판정**해 받은 토큰을 그대로 되돌려준다 |

> `application.properties`의 DB 비밀번호가 평문인 것은 로컬 개발용이며 **git에 올리지 않는다.**
> 에이전트는 이 항목을 반복해서 지적하지 않는다.

### ✅ 해결된 항목

| #   | 위치                        | 내용                                                              | 해결 |
| --- | --------------------------- | ----------------------------------------------------------------- | ---- |
| K1  | `JWTCheckFilter`            | 헤더가 `null`이면 `substring(7)`에서 NPE → catch가 삼켜 원인 왜곡 | `Bearer ` 접두어를 **검사 전에** 확인하고 `log.warn`으로 원인을 남긴다 |
| K2  | `JWTCheckFilter`            | 에러 응답에 `setStatus()`가 없어 HTTP **200**                     | `sendUnauthorized()`로 일원화 · **401** |
| K2′ | `APILoginFailHandler`       | 로그인 실패도 같은 이유로 HTTP **200**                            | **401** |
| K3  | `CustomControllerAdvice:42` | `ResponseEntity.ok()` — JWT 예외도 **200**                        | `ResponseEntity.status(UNAUTHORIZED)` · **401** |
| K5  | `MemberDTO.getClaims()`     | `pw`(BCrypt 해시)를 JWT claims에 포함 → payload에서 그대로 읽힘   | claims에서 제거 · 필터는 credentials에 `null`을 넣는다 **(F1 응답 계약 변경)** |

---

## 완료 판정 기준 (Definition of Done)

기능 변경 후 아래가 **전부** 참이어야 한다.

- [ ] F1~F8 중 어느 것도 깨지지 않았다
- [ ] `front-sjwt`에서 F8-3의 버튼을 전부 눌러 기대 결과와 일치함을 확인했다
- [ ] 응답 JSON 필드명과 에러 문자열이 변경되지 않았다 (변경 시 사용자 승인 완료)
- [ ] `docs/3-TEST.md`의 회귀 체크리스트를 전부 통과했다
- [ ] 프론트엔드에 영향 가는 계약 변경을 명시적으로 보고했다
