-- ================================================================
--  securityJWT — MariaDB 초기 설정
--
--  실행:  mysql -u root -p < db/schema.sql
--         (또는 HeidiSQL / DBeaver에서 통째로 실행)
--
--  ※ 테이블은 spring.jpa.hibernate.ddl-auto=update 가 자동 생성한다.
--    아래 CREATE TABLE 은 "무엇이 만들어지는지" 확인용 참고 DDL이다.
--    직접 만들고 싶으면 §3을 실행하고 ddl-auto 를 validate 로 바꾸면 된다.
-- ================================================================


-- ── 1. 데이터베이스 ────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS securityjwtdb
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;


-- ── 2. 계정 ────────────────────────────────────────────────────
--   application.properties 의 username/password 와 일치해야 한다.
CREATE USER IF NOT EXISTS 'sjwtuser'@'localhost' IDENTIFIED BY 'sjwtpw';
CREATE USER IF NOT EXISTS 'sjwtuser'@'%'         IDENTIFIED BY 'sjwtpw';

GRANT ALL PRIVILEGES ON securityjwtdb.* TO 'sjwtuser'@'localhost';
GRANT ALL PRIVILEGES ON securityjwtdb.* TO 'sjwtuser'@'%';

FLUSH PRIVILEGES;


-- ── 3. 테이블 (참고용 — ddl-auto=update 가 자동 생성) ──────────
USE securityjwtdb;

-- com.securityjwt.domain.Member
CREATE TABLE IF NOT EXISTS member (
  email     VARCHAR(255) NOT NULL,
  pw        VARCHAR(255) NULL,          -- BCrypt 해시가 들어간다 (60자)
  nickname  VARCHAR(255) NULL,
  social    BIT(1)       NOT NULL,
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Member.memberRoleList 는 @ElementCollection 이라 별도 테이블로 떨어진다.
-- 컬럼명 member_role_list 는 JPA 기본 네이밍 규칙(필드명 → snake_case) 결과다.
CREATE TABLE IF NOT EXISTS member_member_role_list (
  member_email      VARCHAR(255) NOT NULL,
  member_role_list  TINYINT      NULL,   -- enum ordinal: 0=USER, 1=MANAGER, 2=ADMIN
  CONSTRAINT fk_member_role_member
    FOREIGN KEY (member_email) REFERENCES member (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── 4. 확인용 조회 ─────────────────────────────────────────────
-- 테스트 코드(MemberRepositoryTests.회원_2명_생성)를 돌린 뒤 실행한다.
--
--   SELECT m.email, m.nickname, m.social, r.member_role_list AS role_ordinal
--     FROM member m
--     LEFT JOIN member_member_role_list r ON r.member_email = m.email
--    ORDER BY m.email;
--
-- 기대 결과
--   user1@aaa.com   USER1    0   → ROLE_USER
--   admin@aaa.com   ADMIN1   0   → ROLE_USER
--   admin@aaa.com   ADMIN1   2   → ROLE_ADMIN


-- ── 5. 초기화가 필요할 때 ──────────────────────────────────────
--   DELETE FROM member_member_role_list;
--   DELETE FROM member;
