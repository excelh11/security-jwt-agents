import { useEffect, useState } from 'react';
import {
  API_BASE,
  callApi,
  decodeJwt,
  extractError,
  forgeExpiredToken,
  isLoginResponse,
  isRefreshResponse,
  login,
  refresh,
  timeLeft,
  tokenStore,
  type CallResult,
} from './api';
import type { LogEntry } from './types';

/** F8-3. 각 버튼이 무엇을 검증하는지 화면에 같이 띄운다 */
interface TestCase {
  label: string;
  detail: string;
  expect: string;
  spec: string;
  run: () => Promise<CallResult>;
  needsLogin: boolean;
}

export default function App() {
  const [email, setEmail] = useState('user1@aaa.com');
  const [password, setPassword] = useState('1111');

  const [accessToken, setAccessToken] = useState(tokenStore.getAccess());
  const [refreshToken, setRefreshToken] = useState(tokenStore.getRefresh());

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tick, setTick] = useState(0); // 남은 시간 표시를 1초마다 다시 그리기 위한 값
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const claims = accessToken ? decodeJwt(accessToken) : null;
  const expired = claims ? claims.exp * 1000 <= Date.now() : false;

  function addLog(title: string, result: CallResult | null, note?: string) {
    const code = result ? extractError(result.data) : null;
    setLogs((prev) => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('ko-KR'),
        title,
        status: result ? result.status : null,
        body: note ?? (result ? formatBody(result) : ''),
        ok: !code,
      },
      ...prev,
    ]);
  }

  function formatBody(result: CallResult): string {
    if (typeof result.data === 'string') return result.data;
    return JSON.stringify(result.data, null, 2);
  }

  async function run(title: string, fn: () => Promise<CallResult>) {
    setBusy(true);
    try {
      const result = await fn();
      addLog(title, result);
      return result;
    } catch (e) {
      // fetch 자체가 실패 = 서버 미기동 또는 CORS 차단
      addLog(
        title,
        null,
        `요청 실패: ${String(e)}\n\n` +
          `· 백엔드가 ${API_BASE} 에 떠 있는지 확인하세요.\n` +
          `· 브라우저 콘솔에 "blocked by CORS policy"가 있으면 F6(CORS) 문제입니다.`,
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  /* ── F1. 로그인 ── */
  async function doLogin(pw: string, title: string) {
    const result = await run(title, () => login(email, pw));
    if (result && isLoginResponse(result.data)) {
      tokenStore.save(result.data.accessToken, result.data.refreshToken);
      setAccessToken(result.data.accessToken);
      setRefreshToken(result.data.refreshToken);
    }
  }

  function doLogout() {
    tokenStore.clear();
    setAccessToken(null);
    setRefreshToken(null);
    addLog('토큰 삭제', null, 'localStorage를 비웠습니다.');
  }

  /* ── F5. 갱신 ── */
  async function doRefresh(withRefreshToken: boolean) {
    if (!accessToken) return;

    const before = accessToken;
    const result = await run(
      withRefreshToken
        ? 'GET /api/member/refresh'
        : 'GET /api/member/refresh (refreshToken 없이)',
      () => refresh(before, withRefreshToken ? refreshToken : null),
    );

    if (result && isRefreshResponse(result.data)) {
      const changed = result.data.accessToken !== before;
      tokenStore.save(result.data.accessToken, result.data.refreshToken);
      setAccessToken(result.data.accessToken);
      setRefreshToken(result.data.refreshToken);
      addLog(
        '갱신 판정',
        null,
        changed
          ? 'accessToken이 새로 발급되었습니다. (기존 토큰이 만료 상태였음)'
          : 'accessToken이 아직 유효하여 기존 토큰 쌍을 그대로 반환했습니다. (F5 판정 3)',
      );
    }
  }

  /* ── F8-4. 강제 만료 ── */
  function doExpire() {
    if (!accessToken) return;
    const forged = forgeExpiredToken(accessToken);
    if (!forged) return;

    tokenStore.setAccess(forged);
    setAccessToken(forged);
    addLog(
      'accessToken 강제 만료',
      null,
      'exp를 1분 전으로 조작했습니다. payload를 건드렸으므로 서명도 깨집니다.\n' +
        '→ 보호 API 호출 시 ERROR_ACCESS_TOKEN, refresh 호출 시 새 토큰 발급이 정상입니다.\n' +
        '(refreshToken은 그대로이므로 refresh로 복구됩니다.)',
    );
  }

  /* ── F8-3. 테스트 케이스 ── */
  const cases: TestCase[] = [
    {
      label: '보호 API 호출 (토큰 O)',
      detail: 'GET /api/sample/user',
      expect: '200 · 인증 주체(email·권한) 반환',
      spec: 'F3',
      needsLogin: true,
      run: () => callApi('/api/sample/user', accessToken),
    },
    {
      label: '보호 API 호출 (토큰 X)',
      detail: 'GET /api/sample/user · Authorization 헤더 없음',
      expect: 'ERROR_ACCESS_TOKEN',
      spec: 'F3',
      needsLogin: false,
      run: () => callApi('/api/sample/user', null),
    },
    {
      label: '위조 토큰으로 호출',
      detail: '토큰 뒤에 문자열을 덧붙여 서명을 깨뜨림',
      expect: 'ERROR_ACCESS_TOKEN',
      spec: 'F3',
      needsLogin: true,
      run: () => callApi('/api/sample/user', accessToken + 'tampered'),
    },
    {
      label: '필터 제외 경로 호출',
      detail: 'GET /api/sample/public · shouldNotFilter 대상',
      expect: '토큰 없이 200',
      spec: 'F3',
      needsLogin: false,
      run: () => callApi('/api/sample/public', null),
    },
    {
      label: '권한 부족 API 호출',
      detail: "GET /api/sample/admin · @PreAuthorize hasRole('ADMIN')",
      expect: 'user1이면 403 ERROR_ACCESSDENIED · admin이면 200',
      spec: 'F4',
      needsLogin: true,
      run: () => callApi('/api/sample/admin', accessToken),
    },
  ];

  return (
    <div className="wrap">
      <header>
        <h1>Security / JWT 확인용 프론트</h1>
        <p className="sub">
          <code>{API_BASE}</code> 로 <b>절대 URL 직접 호출</b> — proxy를 쓰지 않으므로
          모든 요청이 cross-origin이고 preflight(OPTIONS)가 실제로 발생합니다.
          <br />
          개발자도구 <b>Network 탭</b>에 <code>OPTIONS</code>가 먼저 찍히면 CORS(F6)가 살아 있는 것입니다.
        </p>
      </header>

      {/* ── F1 ── */}
      <section>
        <h2>
          F1. 로그인 &amp; 토큰 발급 <span className="ep">POST /api/member/login</span>
        </h2>
        <div className="form">
          <label>
            이메일
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>
        <div className="btns">
          <button
            className="primary"
            disabled={busy}
            onClick={() => doLogin(password, 'POST /api/member/login (로그인)')}
          >
            로그인
          </button>
          <button
            disabled={busy}
            onClick={() =>
              doLogin('wrong-password', 'POST /api/member/login (틀린 비밀번호)')
            }
          >
            틀린 비밀번호로 로그인
          </button>
          <button disabled={!accessToken} onClick={doLogout}>
            토큰 삭제
          </button>
        </div>
        <p className="note">
          테스트 계정 (<code>MemberRepositoryTests.회원_2명_생성</code> 실행 시 만들어집니다)
          <br />·{' '}
          <button
            className="link"
            onClick={() => {
              setEmail('user1@aaa.com');
              setPassword('1111');
            }}
          >
            user1@aaa.com / 1111
          </button>{' '}
          — ROLE_USER · ADMIN 전용 API 호출 시 403이 나야 정상
          <br />·{' '}
          <button
            className="link"
            onClick={() => {
              setEmail('admin@aaa.com');
              setPassword('1111');
            }}
          >
            admin@aaa.com / 1111
          </button>{' '}
          — ROLE_USER + ROLE_ADMIN · 모든 API 통과
        </p>
      </section>

      {/* ── 토큰 상태 ── */}
      <section>
        <h2>현재 토큰 상태</h2>

        <div className="kv">
          <span className="k">accessToken</span>
          {!accessToken ? (
            <span className="badge warn">없음</span>
          ) : (
            <span className={`badge ${expired ? 'fail' : 'ok'}`}>
              {claims ? (expired ? '만료됨' : timeLeft(claims.exp)) : '해독 불가'}
            </span>
          )}
        </div>
        <div className="token">{accessToken ? accessToken : '—'}</div>

        <div className="kv" style={{ marginTop: 14 }}>
          <span className="k">refreshToken</span>
          <span className={`badge ${refreshToken ? 'ok' : 'warn'}`}>
            {refreshToken ? '보관 중' : '없음'}
          </span>
        </div>
        <div className="token">{refreshToken ? refreshToken : '—'}</div>

        <div className="kv" style={{ marginTop: 14 }}>
          <span className="k">payload (claims)</span>
        </div>
        <pre className="payload">
          {claims
            ? JSON.stringify(claims, null, 2)
            : '로그인하면 accessToken의 payload가 표시됩니다.'}
        </pre>
        {claims && (
          <p className="note">
            JWT는 서명만 될 뿐 암호화되지 않아 누구나 Base64로 열어볼 수 있습니다. 그래서 payload에는
            인가에 필요한 것(<code>email</code> · <code>nickname</code> · <code>social</code> ·{' '}
            <code>roleNames</code>)만 담고 <b>비밀번호는 넣지 않습니다</b>.
          </p>
        )}
      </section>

      {/* ── F3 / F4 ── */}
      <section>
        <h2>F3 토큰 검사 · F4 인가</h2>
        <table>
          <thead>
            <tr>
              <th>테스트</th>
              <th>기대 결과</th>
              <th className="act" />
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.label}>
                <td>
                  <b>{c.label}</b>
                  <div className="ep">{c.detail}</div>
                </td>
                <td className="expect">
                  <span className="spec">{c.spec}</span> {c.expect}
                </td>
                <td className="act">
                  <button
                    disabled={busy || (c.needsLogin && !accessToken)}
                    onClick={() => run(c.label, c.run)}
                  >
                    호출
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── F5 ── */}
      <section>
        <h2>
          F5. 토큰 갱신 <span className="ep">/api/member/refresh</span>
        </h2>
        <div className="btns">
          <button
            className="primary"
            disabled={busy || !accessToken}
            onClick={() => doRefresh(true)}
          >
            refresh 호출
          </button>
          <button disabled={busy || !accessToken} onClick={() => doRefresh(false)}>
            refreshToken 없이 호출
          </button>
          <button disabled={!accessToken} onClick={doExpire}>
            accessToken 강제 만료
          </button>
        </div>
        <p className="note">
          · accessToken이 <b>유효하면</b> 기존 토큰 쌍을 그대로 돌려줍니다.
          <br />· <b>강제 만료</b> 후에 눌러야 새 accessToken이 발급됩니다.
          <br />· refreshToken 없이 호출하면 <code>NULL_REFRASH</code> 가 와야 합니다.
        </p>
      </section>

      {/* ── 로그 ── */}
      <section>
        <h2>
          응답 로그
          <button className="right" onClick={() => setLogs([])}>
            지우기
          </button>
        </h2>

        <p className="note">
          에러인데 <b>HTTP 200</b>으로 찍히는 것은 정상이 아니라 기록된 결함{' '}
          <b>K2 / K3</b>입니다. 그래서 이 화면은 <b>상태코드가 아니라 본문의 에러 코드로</b>{' '}
          성공/실패를 판정합니다.
        </p>

        {logs.length === 0 ? (
          <pre className="log empty">여기에 요청과 응답이 기록됩니다.</pre>
        ) : (
          logs.map((l) => (
            <pre key={l.id} className={`log ${l.ok ? '' : 'bad'}`}>
              <b>
                [{l.time}] {l.title}
                {l.status !== null && ` → HTTP ${l.status}`}
              </b>
              {'\n'}
              {l.body}
            </pre>
          ))
        )}
      </section>

      {/* tick을 참조해야 1초마다 남은 시간이 다시 그려진다 */}
      <span hidden>{tick}</span>
    </div>
  );
}
