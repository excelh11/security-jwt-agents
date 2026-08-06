# securityJWT — Spring Security + JWT 작업 프로젝트

**인증/인가(Spring Security + JWT)만 남긴 독립 실행 가능한 Spring Boot 프로젝트**다.
쇼핑몰 기능(상품·장바구니·주문)은 들어 있지 않다.

**이 폴더가 곧 Gradle 프로젝트 루트다.** `.\gradlew.bat bootRun` 을 여기서 실행한다.
검증용 프론트엔드는 형제 폴더 `../front-sjwt` 에 있다. **깃허브에는 이 둘만 올린다.**

---

## 폴더 구조

```
securityJWT/                         ← Gradle 프로젝트 루트
├── build.gradle · settings.gradle
├── gradlew · gradlew.bat · gradle/
├── db/schema.sql                    # MariaDB DB·계정·테이블 (참고 DDL 포함)
├── CLAUDE.md                        # 이 파일 — 프로젝트 메모리
├── .claude/
│   ├── agents/                      # 서브 에이전트
│   │   ├── sjwt-spec.md             #   1단계 SPEC      — 무엇을?
│   │   ├── sjwt-plan.md             #   2단계 PLAN      — 어떻게?
│   │   ├── sjwt-tasks.md            #   3단계 TASKS     — 어떤 순서로?
│   │   └── sjwt-impl.md             #   4단계 IMPLEMENT — 코드로 구현
│   └── commands/sjwt.md             # /sjwt 슬래시 커맨드 (4단계 일괄 진행)
├── docs/
│   ├── 1-SPEC.md                    # ① 필수 기능에 대한 설명
│   ├── 2-PLAN.md                    # ② 기능 구현에 필요한 기술 목록
│   └── 3-TEST.md                    # ③ 테스트하는 방법
└── src/
    ├── main/java/com/securityjwt/
    │   ├── SecurityJwtApplication.java
    │   ├── config/CustomSecurityConfig.java
    │   ├── controller/              # APIRefreshController · SampleController · advice
    │   ├── domain/                  # Member · MemberRole
    │   ├── dto/MemberDTO.java
    │   ├── repository/MemberRepository.java
    │   ├── security/                # CustomUserDetailsService · filter · handler
    │   └── util/                    # JWTUtil · CustomJWTException
    ├── main/resources/application.properties
    └── test/java/com/securityjwt/   # MemberRepositoryTests · JWTUtilTests · JWTCheckFilterTests
```

---

## 작업 흐름

```
SPEC ──→ PLAN ──→ TASKS ──→ IMPLEMENT
무엇을?   어떻게?   어떤 순서로?   코드로 구현
(목적)    (기술)    (작업 순서)
```

| 단계 | 에이전트 | 코드 수정 | 기준 문서 |
|---|---|---|---|
| 1. SPEC | `sjwt-spec` | ❌ | `docs/1-SPEC.md` |
| 2. PLAN | `sjwt-plan` | ❌ | `docs/2-PLAN.md` |
| 3. TASKS | `sjwt-tasks` | ❌ | `docs/1-SPEC.md` |
| 4. IMPLEMENT | `sjwt-impl` | ✅ | `docs/3-TEST.md` |

**사용법**

```
/sjwt 로그인 응답에 회원 가입일을 추가하고 싶어
/sjwt 토큰 만료 시 401 상태코드가 나가게 해줘
```

또는 단계별로 직접 호출한다 — 예: "sjwt-spec 에이전트로 요구사항부터 정리해줘"

---

## 대상 시스템 요약

| 항목 | 값 |
|---|---|
| 패키지 | `com.securityjwt` (**변경 금지**) |
| Java / Spring Boot | 21 / 3.5.15 (Spring Security 6.x) |
| JWT 라이브러리 | `io.jsonwebtoken:jjwt` **0.11.5** |
| 필터 계층 직렬화 | Gson 2.10.1 |
| DB | **MariaDB** `localhost:3306/securityjwtdb` (계정 `sjwtuser`/`sjwtpw`) |
| 서버 포트 | **8080** |
| 검증용 프론트 | `../front-sjwt` (Vite + React + TS, `:5173`) — **별도 프로젝트** |
| accessToken / refreshToken | **10분 / 1440분** |
| 빌드 | `.\gradlew.bat` (Windows) |

### 핵심 소스 위치

| 역할 | 경로 (프로젝트 루트 기준) |
|---|---|
| 필터체인 / CORS | `src/main/java/com/securityjwt/config/CustomSecurityConfig.java` |
| JWT 생성·검증 | `src/main/java/com/securityjwt/util/JWTUtil.java` |
| 토큰 검사 필터 | `src/main/java/com/securityjwt/security/filter/JWTCheckFilter.java` |
| 로그인/접근거부 핸들러 | `src/main/java/com/securityjwt/security/handler/` |
| 인증 주체 | `src/main/java/com/securityjwt/dto/MemberDTO.java` |
| 토큰 갱신 | `src/main/java/com/securityjwt/controller/APIRefreshController.java` |
| 예외 응답 | `src/main/java/com/securityjwt/controller/advice/CustomControllerAdvice.java` |
| 인가 확인용 샘플 API | `src/main/java/com/securityjwt/controller/SampleController.java` |

---

## 절대 규칙

1. **패키지명(`com.securityjwt`)을 바꾸지 않는다.**
2. **에러 문자열과 응답 JSON 필드명은 프론트엔드와의 계약이다.** (`ERROR_LOGIN`, `ERROR_ACCESS_TOKEN`, `ERROR_ACCESSDENIED`, `NULL_REFRASH` …) 변경은 사용자 승인 후에만. 추가는 자유.
3. **CORS는 `CustomSecurityConfig` 한 곳에서만.** MVC(`WebMvcConfigurer.addCorsMappings`)에 CORS를 걸면 시큐리티 필터체인이 앞서기 때문에 preflight가 먼저 차단된다. 그래서 이 프로젝트에는 `CustomServletConfig` 자체를 두지 않았다.
4. **claims를 쓰는 쪽(`MemberDTO.getClaims()`)과 읽는 쪽(`JWTCheckFilter`)은 항상 짝으로 수정한다.** 컴파일러가 불일치를 못 잡는다.
5. **Spring Security 5 문법 금지** — `WebSecurityConfigurerAdapter`, `.and()`, `antMatchers()`, `authorizeRequests()`, `@EnableGlobalMethodSecurity`.
6. **jjwt 0.12.x API 금지** — 현재 0.11.5다. `setClaims()`, `parserBuilder()` 를 쓴다.
7. **신규 gradle 의존성 / jjwt 버전 변경 / DB 스키마 변경은 사용자 승인 필수.**
8. `docs/1-SPEC.md`의 **알려진 결함(K1~K8)은 제안만** 하고, 승인 없이 고치지 않는다.

---

## 실행

```powershell
# 0) DB 준비 (최초 1회) — MariaDB에서 db/schema.sql 실행
# 1) 테스트 계정 생성 (최초 1회)
.\gradlew.bat test --tests "com.securityjwt.repository.MemberRepositoryTests"
# 2) 서버 기동
.\gradlew.bat bootRun            # http://localhost:8080
# 3) 프론트 (별도 터미널)
cd ..\front-sjwt ; npm install ; npm run dev    # http://localhost:5173
```

DB 없이 돌릴 수 있는 테스트 — Security/JWT를 건드리면 최소 이건 통과시킨다.

```powershell
.\gradlew.bat test --tests "com.securityjwt.util.JWTUtilTests" --tests "com.securityjwt.security.filter.JWTCheckFilterTests"
```

---

## 참고

- **git 저장소로 만들 때** `securityJWT`와 `../front-sjwt` 두 폴더만 올린다.
- `docs/1-SPEC.md`의 명세가 바뀌면 **코드보다 문서를 먼저** 고친다.
