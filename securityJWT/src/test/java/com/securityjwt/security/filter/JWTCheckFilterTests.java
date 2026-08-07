package com.securityjwt.security.filter;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.securityjwt.dto.MemberDTO;
import com.securityjwt.util.JWTUtil;

/**
 * 필터는 Mock 객체로 검증한다 — 스프링 컨텍스트도 DB도 필요 없다.
 *
 * MockFilterChain 은 doFilter 가 호출되면 request/response 를 보관한다.
 * chain.getRequest() 가 null 이면 체인이 중단됐다는 뜻이다.
 */
public class JWTCheckFilterTests {

  private final JWTCheckFilter filter = new JWTCheckFilter();

  @AfterEach
  public void clear() {
    SecurityContextHolder.clearContext(); // 테스트 간 인증 상태 누수 방지
  }

  private String accessToken() {
    return JWTUtil.generateToken(Map.of(
        "email", "user1@aaa.com",
        "nickname", "USER1",
        "social", false,
        "roleNames", List.of("USER")), 10);
  }

  @Test
  @DisplayName("정상 토큰이면 SecurityContext에 인증이 저장된다")
  public void validToken() throws Exception {

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/sample/user");
    request.addHeader("Authorization", "Bearer " + accessToken());
    MockFilterChain chain = new MockFilterChain();

    filter.doFilter(request, new MockHttpServletResponse(), chain);

    Authentication auth = SecurityContextHolder.getContext().getAuthentication();

    assertNotNull(auth);
    assertEquals("user1@aaa.com", ((MemberDTO) auth.getPrincipal()).getEmail());
    assertNotNull(chain.getRequest(), "체인이 진행됐어야 한다");
    assertNull(auth.getCredentials(), "인증이 끝난 뒤 자격증명을 들고 있으면 안 된다");
  }

  @Test
  @DisplayName("claims에 비밀번호가 실리지 않는다")
  public void claimsExcludePassword() {

    MemberDTO memberDTO = new MemberDTO(
        "user1@aaa.com", "$2a$10$해시", "USER1", false, List.of("USER"));

    Map<String, Object> claims = memberDTO.getClaims();

    assertFalse(claims.containsKey("pw"), "pw 는 JWT payload 에서 그대로 읽힌다. 넣으면 안 된다");
    assertEquals(Set.of("email", "nickname", "social", "roleNames"), claims.keySet());
  }

  @Test
  @DisplayName("발급된 토큰의 payload를 디코딩해도 해시가 없다")
  public void payloadExcludesHash() {

    String token = JWTUtil.generateToken(
        new MemberDTO("user1@aaa.com", "$2a$10$해시", "USER1", false, List.of("USER")).getClaims(), 10);

    String payload = new String(
        Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);

    assertFalse(payload.contains("$2a$10$"), "payload: " + payload);
  }

  @Test
  @DisplayName("토큰이 없으면 ERROR_ACCESS_TOKEN을 반환하고 체인을 중단한다")
  public void missingToken() throws Exception {

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/sample/user");
    MockHttpServletResponse response = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();

    filter.doFilter(request, response, chain);

    assertTrue(response.getContentAsString().contains("ERROR_ACCESS_TOKEN"));
    assertNull(chain.getRequest(), "컨트롤러로 넘어가면 안 된다");
    assertNull(SecurityContextHolder.getContext().getAuthentication());
    assertEquals(401, response.getStatus(), "인증 실패는 401로 나가야 한다");
  }

  @Test
  @DisplayName("Bearer 접두어가 없으면 401로 거부한다")
  public void missingBearerPrefix() throws Exception {

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/sample/user");
    request.addHeader("Authorization", accessToken()); // "Bearer " 를 빼먹은 경우
    MockHttpServletResponse response = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();

    filter.doFilter(request, response, chain);

    assertEquals(401, response.getStatus());
    assertTrue(response.getContentAsString().contains("ERROR_ACCESS_TOKEN"));
    assertNull(chain.getRequest());
  }

  @Test
  @DisplayName("위조된 토큰이면 거부한다")
  public void tamperedToken() throws Exception {

    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/sample/user");
    request.addHeader("Authorization", "Bearer " + accessToken() + "tampered");
    MockHttpServletResponse response = new MockHttpServletResponse();
    MockFilterChain chain = new MockFilterChain();

    filter.doFilter(request, response, chain);

    assertEquals(401, response.getStatus());
    assertTrue(response.getContentAsString().contains("ERROR_ACCESS_TOKEN"));
    assertNull(chain.getRequest());
  }

  @Test
  @DisplayName("제외경로는 토큰없이도 통과한다")
  public void excludedPaths() throws Exception {

    for (String uri : List.of("/api/member/login", "/api/member/refresh", "/api/sample/public")) {

      MockFilterChain chain = new MockFilterChain();

      filter.doFilter(new MockHttpServletRequest("GET", uri),
          new MockHttpServletResponse(), chain);

      assertNotNull(chain.getRequest(), uri + " 는 통과해야 한다");
    }
  }

  @Test
  @DisplayName("OPTIONS 프리플라이트는 통과한다")
  public void optionsPreflight() throws Exception {

    MockFilterChain chain = new MockFilterChain();

    filter.doFilter(new MockHttpServletRequest("OPTIONS", "/api/sample/user"),
        new MockHttpServletResponse(), chain);

    assertNotNull(chain.getRequest(), "CORS preflight는 검사 없이 통과해야 한다");
  }
}
