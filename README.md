# Security-JWT-Agents

> **인증 코드는 조용히 깨진다.**
> 타입이 맞고 빌드가 통과해도 런타임에 터지고, 에러가 200으로 나가도 화면은 멀쩡해 보인다.
> 이 저장소는 **깨지는 순간을 눈에 보이게 만들고**, **고치는 절차를 도구 권한으로 강제한다.**

**Spring Security + JWT**의 인증·인가가 요청 하나하나에서 어디를 통과하고 어디서 막히는지를
브라우저에서 **HTTP 상태코드와 응답 본문 원문 그대로** 확인하는 풀스택 프로젝트.
그리고 그 인증 코드를 **명세 → 설계 → 작업 순서 → 구현** 순으로만 고칠 수 있게 만든
스펙 주도(spec-driven) 에이전트 파이프라인.

### 이 저장소에 있는 것

- **관문마다 실패를 재현하는 검증 화면** — 토큰 없음 · 위조 · 강제 만료 · 권한 부족 · 갱신까지
  **10가지 시나리오**를 버튼 하나씩으로 눌러보고, 모든 요청의 상태코드와 본문이 로그에 쌓인다.
- **명세를 코드보다 먼저 두는 구조** — 기능 명세 `F1~F8`, 에러 코드 계약, 알려진 결함 `K1~K8`을
  **기준 문서 3종**에 기록한다. 에이전트는 추측 대신 이 문서와 `파일:라인`만 근거로 삼는다.
- **권한으로 강제된 4단계 파이프라인** — 설계 담당 에이전트에게는 **쓰기 도구를 주지 않는다.**
  설계 중에 코드를 건드리는 일이 규율이 아니라 구조로 막힌다.
- **실제로 그 절차로 고친 이력** — `K1`(NPE로 왜곡되던 원인 로그), `K2`·`K3`(인증 실패가 200)을
  이 파이프라인으로 수정하고 **단위 테스트와 실서버 응답 양쪽으로 검증**했다. 남은 결함도 그대로 공개한다.

> **Agents란 —** `.claude/agents/`에 정의된 **재사용 가능한 규칙 묶음**이다.
> 이 저장소를 가져가면 **규칙(에이전트) · 명세(docs) · 코드**가 한 세트로 따라오고,
> `/sjwt` 한 줄이면 Security+JWT 기능을 명세부터 구현·검증까지 순서대로 만들어낸다.
> _(배포되는 애플리케이션 자체에 AI가 들어가는 것은 아니다 — `build.gradle`에 AI 의존성이 없다.)_

|                |                                                                |
| -------------- | -------------------------------------------------------------- |
| **프론트엔드** | React 19 · TypeScript 6 · Vite 8                               |
| **백엔드**     | Java 21 · Spring Boot 3.5.15 · Spring Security 6 · jjwt 0.11.5 |
| **데이터**     | Spring Data JPA · MariaDB                                      |
| **에이전트**   | Claude Code 서브 에이전트 4개 + 슬래시 커맨드                  |

---

## Result Image

로그인부터 토큰 강제 만료·갱신까지 10가지 동작을 버튼 하나씩으로 확인한다.
모든 요청의 **HTTP 상태코드와 응답 본문 원문**이 로그 영역에 그대로 쌓인다.

![Security JWT 확인용 화면](front-sjwt/readmeImage/Security%20JWT%20%ED%99%95%EC%9D%B8%EC%9A%A9.png)

| #   | 동작                             | 기대 결과                                                       |
| --- | -------------------------------- | --------------------------------------------------------------- |
| 1   | 로그인                           | 200 · accessToken · refreshToken 발급, payload와 남은 시간 표시 |
| 2   | 틀린 비밀번호로 로그인           | **401** `ERROR_LOGIN`                                           |
| 3   | 보호 API 호출 (토큰 O)           | 200 · 목록 반환                                                 |
| 4   | 보호 API 호출 (토큰 X)           | **401** `ERROR_ACCESS_TOKEN`                                    |
| 5   | 위조 토큰으로 호출               | **401** `ERROR_ACCESS_TOKEN`                                    |
| 6   | ADMIN 전용 API 호출              | USER 계정이면 **403** `ERROR_ACCESSDENIED`                      |
| 7   | refresh 호출 (토큰 유효)         | 200 · 기존 토큰 쌍 그대로 반환                                  |
| 8   | accessToken 강제 만료 → API 호출 | **401** `ERROR_ACCESS_TOKEN`                                    |
| 9   | 이어서 refresh 호출              | 200 · 새 accessToken 발급                                       |
| 10  | refreshToken 없이 refresh        | 파라미터 누락 → **400** ※                                       |

> ※ `docs/1-SPEC.md`의 F5는 이 경우 `NULL_REFRASH`가 나온다고 적고 있지만, 실제로는 그렇지 않다.
> `APIRefreshController`의 `@RequestParam("refreshToken")`이 필수(기본값)라서 메서드에 들어가기 전에
> Spring이 `MissingServletRequestParameterException`을 던진다. 컨트롤러 안의 `null` 검사는 **도달하지 않는 코드**다.
> `@RequestHeader("Authorization")`도 마찬가지로, 헤더가 아예 없으면 `INVALID_STRING`이 아니라 400이 된다.
> **실제 서버에 요청을 보내 확인한 결과다.** 문서를 실제 동작에 맞추거나 `required = false`로 바꾸거나 —
> 어느 쪽이든 SPEC을 먼저 고치는 게 이 프로젝트의 규칙이다.

프론트는 상태코드가 아니라 **본문의 `error` 문자열로 분기한다.** 401 하나에
`ERROR_LOGIN` · `ERROR_ACCESS_TOKEN` · `Expired` · `INVALID_STRING`이 모두 들어오기 때문에,
어느 관문에서 막혔는지는 상태코드만으로 알 수 없다.

---

## 구성

```
security-jwt-agents/
├── securityJWT/          # 백엔드 — Spring Boot (:8080), Gradle 프로젝트 루트
│   ├── .claude/agents/   #   ← 4단계 파이프라인 에이전트
│   ├── docs/             #   ← 에이전트가 근거로 삼는 기준 문서
│   └── src/main/java/com/securityjwt/
└── front-sjwt/           # 프론트 — Vite + React + TS (:5173), 검증 전용
```

두 프로젝트는 **의도적으로 분리돼 있다.** 오리진이 달라야 CORS와 preflight가 실제로 오가고,
그래야 인증이 진짜로 동작하는지 확인할 수 있다. Vite proxy를 쓰지 않는 이유다.

---

## 실행

터미널 두 개가 필요하다. MariaDB가 먼저 떠 있어야 한다.

```bash
# 0) DB 준비 (최초 1회) — MariaDB에서 securityJWT/db/schema.sql 실행

# 1) 테스트 계정 생성 (최초 1회)
cd securityJWT
./gradlew.bat test --tests "com.securityjwt.repository.MemberRepositoryTests"

# 2) 백엔드 — http://localhost:8080
./gradlew.bat bootRun

# 3) 프론트 (다른 터미널) — http://localhost:5173
cd front-sjwt
npm install
npm run dev
```

테스트 계정 `user1@aaa.com` / `1111` — DB에 **BCrypt로 저장돼 있어야 한다.** 평문이면 무조건 `ERROR_LOGIN`이 난다.

DB 없이 돌릴 수 있는 테스트:

```bash
./gradlew.bat test --tests "com.securityjwt.util.JWTUtilTests" --tests "com.securityjwt.security.filter.JWTCheckFilterTests"
```

---

## Agents

인증 코드는 한 곳을 잘못 고치면 조용히 깨진다. `claims`를 쓰는 쪽과 읽는 쪽처럼
**컴파일러가 불일치를 잡아주지 못하는 결합**이 있기 때문이다.
그래서 코드를 바로 고치지 않고 네 단계를 거치게 만들었다.

```
SPEC  ──→  PLAN  ──→  TASKS  ──→  IMPLEMENT
무엇을?     어떻게?     어떤 순서로?    코드로 구현
```

### 단계별 에이전트

| 단계          | 에이전트     | 도구 권한               | 산출물                          | 기준 문서        |
| ------------- | ------------ | ----------------------- | ------------------------------- | ---------------- |
| 1 · SPEC      | `sjwt-spec`  | `Read` `Glob` `Grep`    | 요구사항 명세, 계약 영향 분석   | `docs/1-SPEC.md` |
| 2 · PLAN      | `sjwt-plan`  | + `Bash` (조회 전용)    | 기술 선택, 설계 결정, 위험 요소 | `docs/2-PLAN.md` |
| 3 · TASKS     | `sjwt-tasks` | `Read` `Glob` `Grep`    | 의존성 순서대로 쪼갠 작업 목록  | `docs/1-SPEC.md` |
| 4 · IMPLEMENT | `sjwt-impl`  | + `Write` `Edit` `Bash` | 코드 + 테스트 + 검증 결과       | `docs/3-TEST.md` |

**핵심은 권한을 단계별로 다르게 준 것이다.** 1~3단계는 쓰기 도구가 아예 없어서
설계 중에 코드를 건드리는 일이 구조적으로 불가능하다. `sjwt-impl`만이 파일을 수정한다.

### 왜 이렇게 하나

새로 발명한 절차가 아니다. **설계 문서를 먼저 쓰고 합의한 뒤 코드를 짜는 것**은 오래된 표준 관행이고,
여기서는 그 각 단계를 사람의 규율이 아니라 **에이전트의 도구 권한으로 강제**했을 뿐이다.
LLM 코딩 도구에서는 같은 방향이 *spec-driven development*라는 이름으로 정착하는 중이다 —
AWS Kiro, GitHub Spec Kit 등이 같은 문제를 풀고 있다.

이 방식이 특히 인증 코드에서 값어치를 하는 이유는 두 가지다.

- **컴파일러가 못 잡는 결합이 있다.** `claims`를 쓰는 쪽(`MemberDTO.getClaims()`)과
  읽는 쪽(`JWTCheckFilter`)은 문자열 키로만 이어져 있어서, 한쪽만 고치면 빌드는 통과하고 런타임에 터진다.
  `docs/1-SPEC.md`가 이 짝을 명시해두기 때문에 SPEC 단계에서 걸린다.
- **에러 문자열이 그대로 API 계약이다.** `ERROR_ACCESS_TOKEN` 하나를 바꾸면 프론트의 분기가 조용히 깨진다.
  SPEC 단계가 계약 영향을 먼저 판정하고, 깨지는 항목이 있으면 거기서 멈춘다.

### 사용법

```
/sjwt 로그인 응답에 회원 가입일을 추가하고 싶어
/sjwt 토큰 만료 시 401 상태코드가 나가게 해줘
```

한 단계가 끝나면 결과를 보여주고 **승인을 받은 뒤** 다음으로 넘어간다. 네 단계를 몰아서 실행하지 않는다.
단계별로 직접 부를 수도 있다 — _"sjwt-spec 에이전트로 요구사항부터 정리해줘"_

### 에이전트가 지키는 규칙

- **추측하지 않는다.** 반드시 실제 파일을 읽고 `파일:라인`을 근거로 현재 동작을 서술한다.
- **에러 문자열과 응답 필드명은 프론트와의 계약이다.** (`ERROR_LOGIN`, `ERROR_ACCESS_TOKEN`,
  `ERROR_ACCESSDENIED`, `NULL_REFRASH` …) 변경은 사용자 승인 후에만, 추가는 자유.
- **알려진 결함(K1~K8)은 제안만 한다.** 승인 없이 고치거나 범위를 넓히지 않는다.
- **실패를 숨기지 않는다.** 테스트가 깨졌으면 출력 원문을 그대로 붙인다.
  DB가 없어 `@SpringBootTest`를 못 돌렸으면 "통과했다"고 말하지 않는다.

### 기준 문서

에이전트는 이 세 문서를 근거로만 판단한다. **명세가 바뀌면 코드보다 문서를 먼저 고친다.**

| 문서                                           | 내용                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| [`docs/1-SPEC.md`](securityJWT/docs/1-SPEC.md) | 기능 명세 `F1~F8`, 에러 코드 계약, 알려진 결함 `K1~K8` |
| [`docs/2-PLAN.md`](securityJWT/docs/2-PLAN.md) | 사용 가능한 기술, 금지 API, 요청 처리 흐름         |
| [`docs/3-TEST.md`](securityJWT/docs/3-TEST.md) | 테스트 코드 템플릿, 회귀 체크리스트                |

### 다른 프로젝트에 가져다 쓰기

에이전트는 **빈 폴더에서 처음부터 만들어내는 용도가 아니다.** `sjwt-spec`이
_"추측하지 않는다. 반드시 실제 파일을 읽고 현재 동작을 확인한 뒤 서술한다"_ 를 전제로 움직이기 때문이다.
대신 **이 저장소를 출발점으로 삼으면** 코드·명세·규칙이 한 세트로 따라오므로, 거기서 키워나가는 방식이 맞다.

**1. 저장소를 가져온다**

```bash
git clone https://github.com/excelh11/security-jwt-agents.git my-auth
cd my-auth
```

**2. 패키지명을 바꾼다** — `com.securityjwt` 를 원하는 이름으로. 세 곳을 함께 고쳐야 한다.

```
src/main/java/com/securityjwt/     디렉터리 이름
src/test/java/com/securityjwt/     디렉터리 이름
*.java 의 package · import 선언
docs/*.md · CLAUDE.md 의 경로 표기
```

**3. DB 설정을 채운다**

```bash
cd securityJWT/src/main/resources
cp application.properties.example application.properties   # 값 채우기
```

**4. `docs/1-SPEC.md` 부터 고친다.** 코드보다 명세가 먼저다.
필요 없는 기능(F1~F8)은 지우고, 새로 필요한 것을 요구사항으로 적는다. 에이전트는 이 문서를 근거로 판단한다.

**5. `/sjwt` 로 기능을 추가한다**

```
/sjwt 소셜 로그인으로 발급한 토큰도 같은 필터를 타게 해줘
```

> ⚠️ **에이전트 정의는 `securityJWT/.claude/` 에 있다.** 저장소 루트가 아니라
> **`securityJWT` 폴더에서 Claude Code를 실행해야** `/sjwt` 와 서브 에이전트가 잡힌다.

---

## Class diagrams

### 1 · 패키지와 의존 방향

16개 클래스가 여섯 패키지에 어떻게 배치돼 있고, 의존이 어느 방향으로만 흐르는지.

![패키지와 의존 방향](securityJWT/docs/diagrams/class-diagram-1-packages.png)

### 2 · 인증 주체를 나르는 네 클래스

DB의 `Member`와 Spring Security가 이해하는 `MemberDTO`는 필드가 거의 같지만 다른 타입이다.
둘을 잇는 유일한 지점이 `CustomUserDetailsService.loadUserByUsername()`이다.

![인증 주체 클래스](securityJWT/docs/diagrams/class-diagram-2-member.png)

### 3 · claims 를 쓰는 쪽과 읽는 쪽

`MemberDTO`가 자기 필드를 `Map`으로 납작하게 만들어 토큰에 싣고,
`JWTCheckFilter`가 그 `Map`에서 키를 하나씩 꺼내 다시 조립한다.
**문자열로만 이어져 있어서 한쪽만 고치면 컴파일은 통과하고 런타임에 터진다.**

![claims 순환](securityJWT/docs/diagrams/class-diagram-3-claims.png)

### 4 · 시큐리티 · 컨트롤러 · util 클래스의 멤버

![클래스 멤버](securityJWT/docs/diagrams/class-diagram-4-members.png)

---

## 백엔드 코드의 알려진 결함

결함을 숨기지 않고 `docs/1-SPEC.md`에 K1~K8로 전부 기록한다. 에이전트는 이 항목들을
**승인 없이 고치지 못한다** — 무엇을 알고도 남겨뒀는지가 기록으로 남는 것이 목적이다.

### 남아 있는 것

| #           | 내용                                                 | 성격                                                                              |
| ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| **K4**      | JWT 서명 키가 `JWTUtil.java`에 하드코딩돼 있다.      | ⚪ **공개된 예시 키**로 의도한 것이다. 실서비스에서는 반드시 환경변수로 빼야 한다. |
| **K8**      | `checkExpiredToken()`이 `"Expired"`만 만료로 본다.   | 🟡 형식이 깨진 토큰을 "아직 유효"로 판정해 받은 토큰을 그대로 되돌려준다.          |
| **K6 · K7** | jjwt 0.11.5 deprecated API 사용 · URL 레벨 인가 없음 | ⚪ 현재 스택에서는 동작에 문제 없음                                                |

### 해결된 것 — 전부 이 파이프라인으로 고쳤다

| #      | 내용                                                              | 조치                                                                    |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **K1** | 헤더가 `null`이면 `substring(7)`에서 NPE → catch가 삼켜 원인 왜곡 | `Bearer ` 접두어를 검사 전에 확인하고 `log.warn`으로 원인을 남긴다      |
| **K2** | 인증 실패가 `setStatus()` 없이 나가 HTTP 200                      | `JWTCheckFilter` · `APILoginFailHandler` 모두 **401**                   |
| **K3** | `ResponseEntity.ok()` — JWT 예외도 200                            | `ResponseEntity.status(UNAUTHORIZED)` — **401**                         |
| **K5** | `pw`(BCrypt 해시)가 JWT claims에 실려 payload에서 그대로 읽혔다   | claims에서 제거 · credentials에 `null` — **F1 응답 계약 변경**을 동반했다 |

K5는 **응답 계약이 바뀌는 변경**이라 `docs/1-SPEC.md`의 F1을 먼저 고치고,
`MemberDTO.getClaims()`(쓰는 쪽)와 `JWTCheckFilter`(읽는 쪽)를 한 번에,
그리고 프론트의 `types.ts`까지 짝으로 수정했다. 회귀를 막기 위해
**발급된 토큰의 payload를 디코딩해 해시가 없는지 단언하는 테스트**를 추가했다.

`application.properties`의 DB 접속 정보는 **로컬 개발용**이며 저장소에 올리지 않는다.

---

## 라이선스

[MIT](LICENSE)
