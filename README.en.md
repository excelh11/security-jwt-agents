# Security-JWT-Agents

[한국어](README.md) · **English** · [中文](README.zh-CN.md)

> **Auth code breaks quietly.**
> The types line up, the build passes, and it still blows up at runtime — or the error goes out as a 200 and the screen looks perfectly fine.
> This repository **makes the moment of failure visible**, and **enforces the procedure for fixing it through tool permissions.**

A full-stack project that lets you watch, request by request, exactly where **Spring Security + JWT** authentication and authorization passes and where it gets blocked — with the **raw HTTP status code and response body** shown in the browser.
Plus a spec-driven agent pipeline that lets that auth code be changed **only** in the order **spec → design → task order → implementation**.

### What's in here

- **A verification screen that reproduces failure at every gate** — no token, forged token, forced expiry, insufficient role, refresh: **10 scenarios**, one button each, with every request's status code and body accumulating in a log panel.
- **A structure that puts the spec before the code** — functional spec `F1~F8`, the error-code contract, and known defects `K1~K8` are recorded in **three reference documents**. Agents reason from those documents and `file:line` evidence, never from guesswork.
- **A 4-stage pipeline enforced by permissions** — the design-stage agents **are not given write tools.** Touching code during design is blocked structurally, not by discipline.
- **A track record of actually fixing things this way** — `K1` (a NPE that distorted the cause in the logs) and `K2`·`K3` (auth failures returning 200) were fixed through this pipeline and **verified by both unit tests and live server responses**. The remaining defects are published as-is.

> **What "Agents" means here —** a **reusable rule set** defined in `.claude/agents/`.
> Take this repository and the **rules (agents) · specs (docs) · code** come as one package;
> a single `/sjwt` line walks a Security+JWT feature from spec through implementation and verification, in order.
> _(No AI ships inside the deployed application itself — there is no AI dependency in `build.gradle`.)_

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Frontend** | React 19 · TypeScript 6 · Vite 8                               |
| **Backend**  | Java 21 · Spring Boot 3.5.15 · Spring Security 6 · jjwt 0.11.5 |
| **Data**     | Spring Data JPA · MariaDB                                      |
| **Agents**   | 4 Claude Code subagents + a slash command                      |

---

## Result Image

Ten behaviours, from login through forced token expiry and refresh, each behind its own button.
Every request's **HTTP status code and raw response body** stacks up in the log panel.

![Security JWT verification screen](front-sjwt/readmeImage/Security%20JWT%20%ED%99%95%EC%9D%B8%EC%9A%A9.png)

| #   | Action                              | Expected result                                                    |
| --- | ----------------------------------- | ------------------------------------------------------------------ |
| 1   | Log in                              | 200 · accessToken · refreshToken issued, payload and time remaining |
| 2   | Log in with the wrong password      | **401** `ERROR_LOGIN`                                              |
| 3   | Call a protected API (with token)   | 200 · list returned                                                |
| 4   | Call a protected API (no token)     | **401** `ERROR_ACCESS_TOKEN`                                       |
| 5   | Call with a forged token            | **401** `ERROR_ACCESS_TOKEN`                                       |
| 6   | Call the ADMIN-only API             | **403** `ERROR_ACCESSDENIED` for a USER account                    |
| 7   | Call refresh (token still valid)    | 200 · the same token pair is returned unchanged                     |
| 8   | Force accessToken expiry → call API | **401** `ERROR_ACCESS_TOKEN`                                       |
| 9   | Then call refresh                   | 200 · a new accessToken is issued                                  |
| 10  | Call refresh without refreshToken   | missing parameter → **400** ※                                      |

> ※ F5 in `docs/1-SPEC.md` states that this case returns `NULL_REFRASH`. It does not.
> `@RequestParam("refreshToken")` in `APIRefreshController` is required (the default), so Spring throws
> `MissingServletRequestParameterException` before the method is ever entered. The `null` check inside the
> controller is **unreachable code**. `@RequestHeader("Authorization")` behaves the same way — if the header is
> absent entirely you get a 400, not `INVALID_STRING`.
> **This was confirmed by sending real requests to a running server.** Either bring the document in line with the
> actual behaviour or switch to `required = false` — either way, the rule in this project is that the SPEC gets
> fixed first.

The frontend branches on the **`error` string in the body**, not on the status code. A single 401 carries
`ERROR_LOGIN` · `ERROR_ACCESS_TOKEN` · `Expired` · `INVALID_STRING` alike, so the status code alone cannot tell
you which gate blocked the request.

---

## Layout

```
security-jwt-agents/
├── securityJWT/          # Backend — Spring Boot (:8080), the Gradle project root
│   ├── .claude/agents/   #   ← the 4-stage pipeline agents
│   ├── docs/             #   ← the reference documents the agents reason from
│   └── src/main/java/com/securityjwt/
└── front-sjwt/           # Frontend — Vite + React + TS (:5173), verification only
```

The two projects are **deliberately kept apart.** Only with different origins do CORS and preflight actually
travel over the wire, and only then can you confirm the auth really works. That is why no Vite proxy is used.

---

## Running it

You need two terminals, and MariaDB must already be up.

```bash
# 0) Prepare the DB (once) — run securityJWT/db/schema.sql in MariaDB

# 1) Create the test accounts (once)
cd securityJWT
./gradlew.bat test --tests "com.securityjwt.repository.MemberRepositoryTests"

# 2) Backend — http://localhost:8080
./gradlew.bat bootRun

# 3) Frontend (another terminal) — http://localhost:5173
cd front-sjwt
npm install
npm run dev
```

Test account `user1@aaa.com` / `1111` — it **must be stored BCrypt-hashed** in the DB. Plain text always yields `ERROR_LOGIN`.

Tests that run without a database:

```bash
./gradlew.bat test --tests "com.securityjwt.util.JWTUtilTests" --tests "com.securityjwt.security.filter.JWTCheckFilterTests"
```

---

## Agents

Auth code breaks quietly when you change one place wrongly, because it contains couplings **the compiler cannot
check** — such as the side that writes `claims` and the side that reads them.
So the code is not edited directly; it goes through four stages.

```
SPEC  ──→  PLAN  ──→  TASKS  ──→  IMPLEMENT
what?      how?       in what order?   write the code
```

### The agents, stage by stage

| Stage         | Agent        | Tool permissions           | Output                                     | Reference doc    |
| ------------- | ------------ | -------------------------- | ------------------------------------------ | ---------------- |
| 1 · SPEC      | `sjwt-spec`  | `Read` `Glob` `Grep`       | Requirements, contract-impact analysis      | `docs/1-SPEC.md` |
| 2 · PLAN      | `sjwt-plan`  | + `Bash` (read-only usage) | Technology choices, design decisions, risks | `docs/2-PLAN.md` |
| 3 · TASKS     | `sjwt-tasks` | `Read` `Glob` `Grep`       | A task list split in dependency order       | `docs/1-SPEC.md` |
| 4 · IMPLEMENT | `sjwt-impl`  | + `Write` `Edit` `Bash`    | Code + tests + verification results         | `docs/3-TEST.md` |

**The point is that the permissions differ per stage.** Stages 1–3 have no write tools at all, so touching code
during design is structurally impossible. Only `sjwt-impl` modifies files.

### Why do it this way

This is not a newly invented procedure. **Writing a design document, agreeing on it, and only then writing code**
is a long-standing standard practice; what happens here is that each stage is enforced by **the agent's tool
permissions** rather than by human discipline. In LLM coding tools the same direction is settling under the name
*spec-driven development* — AWS Kiro, GitHub Spec Kit and others are solving the same problem.

There are two reasons this pays off specifically for auth code.

- **There are couplings the compiler cannot catch.** The side that writes `claims` (`MemberDTO.getClaims()`) and
  the side that reads them (`JWTCheckFilter`) are joined only by string keys, so changing one leaves the build
  green and blows up at runtime. `docs/1-SPEC.md` records the pair explicitly, so the SPEC stage catches it.
- **Error strings are the API contract.** Change `ERROR_ACCESS_TOKEN` alone and the frontend's branching breaks
  silently. The SPEC stage judges contract impact first and stops there if anything would break.

### How to use it

```
/sjwt add the member's signup date to the login response
/sjwt make token expiry return a 401 status code
```

After each stage it shows the result and moves on **only once approved**. It never runs all four in one go.
You can also invoke a single stage directly — _"use the sjwt-spec agent to sort out the requirements first"_.

### Rules the agents follow

- **Never guess.** Always read the actual file and describe current behaviour with `file:line` as evidence.
- **Error strings and response field names are a contract with the frontend.** (`ERROR_LOGIN`,
  `ERROR_ACCESS_TOKEN`, `ERROR_ACCESSDENIED`, `NULL_REFRASH` …) Changes only after user approval; additions are free.
- **Known defects (`K1~K8`) may only be proposed.** Never fixed, and never widened in scope, without approval.
- **Never hide a failure.** If a test breaks, paste the raw output. If `@SpringBootTest` could not run because
  there was no database, do not claim "it passed".

### Reference documents

The agents judge only from these three. **When the spec changes, the document is fixed before the code.**

| Document                                       | Contents                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| [`docs/1-SPEC.md`](securityJWT/docs/1-SPEC.md) | Functional spec `F1~F8`, the error-code contract, known defects `K1~K8`      |
| [`docs/2-PLAN.md`](securityJWT/docs/2-PLAN.md) | Available technologies, forbidden APIs, request-processing flow              |
| [`docs/3-TEST.md`](securityJWT/docs/3-TEST.md) | Test-code templates, regression checklist                                    |

### Reusing this in another project

The agents are **not meant to build something from scratch in an empty folder.** `sjwt-spec` operates on the
premise of _"never guess; always read the actual file and confirm current behaviour before describing it."_
Instead, **start from this repository** — the code, specs and rules travel together — and grow from there.

**1. Get the repository**

```bash
git clone https://github.com/excelh11/security-jwt-agents.git my-auth
cd my-auth
```

**2. Change the package name** — `com.securityjwt` to whatever you want. Three places must change together.

```
src/main/java/com/securityjwt/     directory name
src/test/java/com/securityjwt/     directory name
package · import declarations in *.java
path references in docs/*.md · CLAUDE.md
```

**3. Fill in the DB settings**

```bash
cd securityJWT/src/main/resources
cp application.properties.example application.properties   # fill in the values
```

**4. Start by editing `docs/1-SPEC.md`.** The spec comes before the code.
Delete the features (`F1~F8`) you do not need and write down what you do need as requirements. The agents judge
from this document.

**5. Add features with `/sjwt`**

```
/sjwt make tokens issued via social login go through the same filter
```

> ⚠️ **The agent definitions live in `securityJWT/.claude/`.** You have to run Claude Code **from the
> `securityJWT` folder**, not from the repository root, for `/sjwt` and the subagents to be picked up.

---

## Class diagrams

### 1 · Packages and the direction of dependencies

How 16 classes are laid out across six packages, and which single direction the dependencies flow in.

![Packages and dependencies](securityJWT/docs/diagrams/class-diagram-1-packages.png)

### 2 · The four classes that carry the authenticated principal

`Member` in the DB and `MemberDTO` as Spring Security understands it have nearly identical fields but are
different types. The only place that joins them is `CustomUserDetailsService.loadUserByUsername()`.

![Principal classes](securityJWT/docs/diagrams/class-diagram-2-member.png)

### 3 · The side that writes claims and the side that reads them

`MemberDTO` flattens its own fields into a `Map` and loads it into the token; `JWTCheckFilter` pulls the keys
back out of that `Map` one by one and reassembles it.
**They are joined by strings alone, so changing one side leaves compilation green and blows up at runtime.**

![The claims round trip](securityJWT/docs/diagrams/class-diagram-3-claims.png)

### 4 · Members of the security, controller and util classes

![Class members](securityJWT/docs/diagrams/class-diagram-4-members.png)

---

## Known defects in the backend code

Defects are not hidden; all of them are recorded in `docs/1-SPEC.md` as `K1~K8`. The agents **cannot fix these
without approval** — the point is to leave a record of what was known and deliberately left in place.

### Still open

| #           | Description                                                             | Nature                                                                                              |
| ----------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **K4**      | The JWT signing key is hard-coded in `JWTUtil.java`.                    | ⚪ Intentional — a **publicly known example key**. In production it must be moved to an env variable. |
| **K8**      | `checkExpiredToken()` treats only `"Expired"` as expiry.                | 🟡 A malformed token is judged "still valid", so the token you sent is handed straight back.          |
| **K6 · K7** | Deprecated jjwt 0.11.5 APIs · no URL-level authorization                | ⚪ No behavioural problem on the current stack                                                        |

### Fixed — all of them through this pipeline

| #      | Description                                                                     | Action taken                                                                     |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **K1** | A `null` header caused an NPE at `substring(7)` → the catch swallowed the cause | Check the `Bearer ` prefix before validating, and log the cause with `log.warn`   |
| **K2** | Auth failures went out without `setStatus()`, i.e. HTTP 200                     | `JWTCheckFilter` · `APILoginFailHandler` both return **401**                      |
| **K3** | `ResponseEntity.ok()` — JWT exceptions returned 200 as well                     | `ResponseEntity.status(UNAUTHORIZED)` — **401**                                   |
| **K5** | `pw` (the BCrypt hash) rode along in the JWT claims and was readable in payload | Removed from claims · `null` credentials — this **changed the F1 response contract** |

Because K5 **changes the response contract**, F1 in `docs/1-SPEC.md` was fixed first, then
`MemberDTO.getClaims()` (the writing side) and `JWTCheckFilter` (the reading side) were changed together,
along with the frontend's `types.ts` as a matching pair. To prevent regression, a test was added that
**decodes the payload of an issued token and asserts that no hash is present**.

The DB credentials in `application.properties` are **for local development** and are not committed.

---

## License

[MIT](LICENSE)
