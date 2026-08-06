package com.securityjwt.security.filter;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;
import java.util.Map;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.google.gson.Gson;
import com.securityjwt.dto.MemberDTO;
import com.securityjwt.util.JWTUtil;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.log4j.Log4j2;

@Log4j2
public class JWTCheckFilter extends OncePerRequestFilter{
    
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) throws ServletException{
             // Preflight요청은 체크하지 않음
             // 어떠한 요청을 보낼껀데, 너희 서버 잘돌아가니? 
        if(request.getMethod().equals("OPTIONS")){
            return true;
        }

        String path = request.getRequestURI();

        log.info("check uri......................."+path);

                //api/member/ 경로의 호출은 체크하지 않음 
    if(path.startsWith("/api/member/")) {
        return true;
      }

        // 토큰 없이 열어두는 샘플 경로
        // (<img src>처럼 Authorization 헤더를 실을 수 없는 호출을 위한 자리다)
        if(path.startsWith("/api/sample/public")){
            return true;
        }

        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) 
    throws ServletException, IOException{

         log.info("------------------------JWTCheckFilter------------------");

    String authHeaderStr = request.getHeader("Authorization");

    // 헤더가 없거나 형식이 다르면 substring(7) 전에 걸러낸다.
    // 예전에는 여기서 NPE가 나고 아래 catch가 삼켜서, 원인이 "헤더 없음"인지
    // "토큰이 깨짐"인지 로그만 봐서는 구분할 수 없었다.
    if (authHeaderStr == null || !authHeaderStr.startsWith("Bearer ")) {
      log.warn("Authorization 헤더가 없거나 'Bearer ' 접두어가 빠졌다: " + authHeaderStr);
      sendUnauthorized(response);
      return;
    }

    try {
      //Bearer accestoken...
      String accessToken = authHeaderStr.substring(7);
      Map<String, Object> claims = JWTUtil.validateToken(accessToken);

      log.info("JWT claims: " + claims);

    //   filterChain.doFilter(request, response); 

  String email = (String) claims.get("email");
      String nickname = (String) claims.get("nickname");
      Boolean social = (Boolean) claims.get("social");
      List<String> roleNames = (List<String>) claims.get("roleNames");

      // 비밀번호는 claims에 없다. 상위 타입인 User 가 null 을 거부하므로 빈 문자열을 넣는다.
      MemberDTO memberDTO = new MemberDTO(email, "", nickname, social.booleanValue(), roleNames);

      log.info("-----------------------------------");
      log.info(memberDTO);
      log.info(memberDTO.getAuthorities());

      // credentials 는 null 이다 — 이미 토큰으로 인증이 끝난 뒤라 자격증명을 들고 있을 이유가 없다.
      UsernamePasswordAuthenticationToken authenticationToken
      = new UsernamePasswordAuthenticationToken(memberDTO, null, memberDTO.getAuthorities());

      SecurityContextHolder.getContext().setAuthentication(authenticationToken);

      filterChain.doFilter(request, response);

    }catch(Exception e){

      log.error("JWT Check Error..............");
      log.error(e.getMessage());

      sendUnauthorized(response);
    }
  }

  /**
   * 인증 실패 응답. 반드시 401을 실어 보낸다.
   *
   * 상태코드를 남기지 않으면 200으로 나가서, 클라이언트가 성공과 실패를
   * 본문 문자열로만 구분해야 한다. 표준 인터셉터가 동작하지 않게 된다.
   */
  private void sendUnauthorized(HttpServletResponse response) throws IOException {

    Gson gson = new Gson();
    String msg = gson.toJson(Map.of("error", "ERROR_ACCESS_TOKEN"));

    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType("application/json; charset=UTF-8");

    PrintWriter printWriter = response.getWriter();
    printWriter.println(msg);
    printWriter.close();
  }

}