package com.securityjwt.dto;

import java.util.*;
import java.util.stream.Collectors;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class MemberDTO extends User {

  private String email;
    
  private String pw;

  private String nickname;

  private boolean social;

  private List<String> roleNames = new ArrayList<>();

  public MemberDTO(String email, String pw, String nickname, boolean social, List<String> roleNames) {
    super(
      email,
      pw, 
      roleNames.stream().map(str -> new SimpleGrantedAuthority("ROLE_"+str)).collect(Collectors.toList()));
    
    this.email = email;
    this.pw = pw;
    this.nickname = nickname;
    this.social = social;
    this.roleNames = roleNames;
  }

  /**
   * JWT에 실을 claims.
   *
   * pw(BCrypt 해시)는 넣지 않는다. JWT payload는 서명될 뿐 암호화되지 않아
   * Base64 디코딩만으로 읽히기 때문이다. 인가에 필요한 것만 담는다.
   *
   * 여기를 바꾸면 읽는 쪽인 JWTCheckFilter 도 반드시 같이 고쳐야 한다.
   * 컴파일러가 불일치를 잡아주지 못한다.
   */
  public Map<String, Object> getClaims() {

    Map<String, Object> dataMap = new HashMap<>();

    dataMap.put("email", email);
    dataMap.put("nickname", nickname);
    dataMap.put("social", social);
    dataMap.put("roleNames", roleNames);

    return dataMap;
  }

}