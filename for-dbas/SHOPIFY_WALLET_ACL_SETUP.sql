-- ============================================================================
-- SHOPIFY WALLET AND ACL SETUP FOR DEMO ENVIRONMENT
-- ============================================================================
-- Run as: SYS or DBA with SYSDBA privileges
-- Server: nrf-oci-db-01/demodb
-- Date: 2026-01-06
-- 
-- Prerequisites:
-- 1. Shopify development store created (e.g., farsightiq-demo.myshopify.com)
-- 2. Access to server filesystem for wallet creation
-- ============================================================================

SET SERVEROUTPUT ON;
SET ECHO ON;

-- ============================================================================
-- STEP 1: CREATE WALLET DIRECTORY (Run on OS first)
-- ============================================================================
/*
-- SSH to Oracle server and run:
mkdir -p /u01/app/oracle/admin/wallet/shopify
cd /u01/app/oracle/admin/wallet/shopify

-- Create the wallet using orapki
orapki wallet create -wallet . -pwd WalletPassword123 -auto_login

-- Download and add Shopify's root CA certificates (DigiCert)
-- Shopify uses DigiCert Global Root G2
wget https://cacerts.digicert.com/DigiCertGlobalRootG2.crt.pem -O digicert_root.pem

-- Add certificate to wallet
orapki wallet add -wallet . -trusted_cert -cert digicert_root.pem -pwd WalletPassword123

-- Verify wallet contents
orapki wallet display -wallet .

-- Set permissions
chmod 640 cwallet.sso ewallet.p12
chown oracle:oinstall cwallet.sso ewallet.p12
*/

-- ============================================================================
-- STEP 2: CREATE ACL FOR SHOPIFY ACCESS
-- ============================================================================

-- Create the ACL
BEGIN
  DBMS_NETWORK_ACL_ADMIN.CREATE_ACL(
    acl         => 'shopify_demo.xml',
    description => 'ACL for FarsightIQ Shopify Demo Store',
    principal   => 'OMNI',
    is_grant    => TRUE,
    privilege   => 'connect'
  );
  DBMS_OUTPUT.PUT_LINE('ACL created: shopify_demo.xml');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -46212 THEN
      DBMS_OUTPUT.PUT_LINE('ACL already exists, continuing...');
    ELSE
      RAISE;
    END IF;
END;
/

-- Add resolve privilege
BEGIN
  DBMS_NETWORK_ACL_ADMIN.ADD_PRIVILEGE(
    acl       => 'shopify_demo.xml',
    principal => 'OMNI',
    is_grant  => TRUE,
    privilege => 'resolve'
  );
  DBMS_OUTPUT.PUT_LINE('Resolve privilege added to OMNI');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -46212 THEN
      DBMS_OUTPUT.PUT_LINE('Privilege already exists, continuing...');
    ELSE
      RAISE;
    END IF;
END;
/

-- ============================================================================
-- STEP 3: ASSIGN ACL TO SHOPIFY HOST
-- ============================================================================

-- Assign to demo Shopify store
BEGIN
  DBMS_NETWORK_ACL_ADMIN.ASSIGN_ACL(
    acl        => 'shopify_demo.xml',
    host       => 'jesta-demo.myshopify.com',
    lower_port => 80,
    upper_port => 443
  );
  DBMS_OUTPUT.PUT_LINE('ACL assigned to: jesta-demo.myshopify.com');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -46213 THEN
      DBMS_OUTPUT.PUT_LINE('Host already assigned, continuing...');
    ELSE
      RAISE;
    END IF;
END;
/

-- Optional: Add wildcard for all myshopify.com subdomains
BEGIN
  DBMS_NETWORK_ACL_ADMIN.ASSIGN_ACL(
    acl        => 'shopify_demo.xml',
    host       => '*.myshopify.com',
    lower_port => 80,
    upper_port => 443
  );
  DBMS_OUTPUT.PUT_LINE('ACL assigned to: *.myshopify.com (wildcard)');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -46213 THEN
      DBMS_OUTPUT.PUT_LINE('Wildcard host already assigned, continuing...');
    ELSE
      RAISE;
    END IF;
END;
/

COMMIT;

-- ============================================================================
-- STEP 4: VERIFY CONFIGURATION
-- ============================================================================

PROMPT
PROMPT === ACL Configuration ===
SELECT ACL, HOST, LOWER_PORT, UPPER_PORT 
FROM DBA_NETWORK_ACLS 
WHERE ACL LIKE '%shopify%'
ORDER BY HOST;

PROMPT
PROMPT === OMNI Privileges ===
SELECT ACL, PRINCIPAL, PRIVILEGE, IS_GRANT 
FROM DBA_NETWORK_ACL_PRIVILEGES 
WHERE PRINCIPAL = 'OMNI' AND ACL LIKE '%shopify%';

-- ============================================================================
-- STEP 5: TEST CONNECTION (Run as OMNI)
-- ============================================================================
/*
-- Connect as OMNI and run:
SET SERVEROUTPUT ON;

DECLARE
  l_request   UTL_HTTP.REQ;
  l_response  UTL_HTTP.RESP;
  l_url       VARCHAR2(500) := 'https://jesta-demo.myshopify.com/admin/api/2024-10/shop.json';
BEGIN
  -- Set wallet
  UTL_HTTP.SET_WALLET('file:/u01/app/oracle/admin/wallet/shopify', 'WalletPassword123');
  
  -- Make request
  l_request := UTL_HTTP.BEGIN_REQUEST(l_url, 'GET', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_request, 'X-Shopify-Access-Token', 'shpat_CHANGE_ME');
  UTL_HTTP.SET_HEADER(l_request, 'Content-Type', 'application/json');
  
  l_response := UTL_HTTP.GET_RESPONSE(l_request);
  
  DBMS_OUTPUT.PUT_LINE('Status: ' || l_response.status_code);
  DBMS_OUTPUT.PUT_LINE('Reason: ' || l_response.reason_phrase);
  
  UTL_HTTP.END_RESPONSE(l_response);
  
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/
*/

-- ============================================================================
-- DONE!
-- ============================================================================
PROMPT
PROMPT ============================================================================
PROMPT Oracle Wallet and ACL setup complete!
PROMPT 
PROMPT Next steps:
PROMPT 1. Create wallet on filesystem (see Step 1 comments above)
PROMPT 2. Add DigiCert root CA certificate to wallet
PROMPT 3. Run this script as SYS to create ACLs
PROMPT 4. Test connection as OMNI user
PROMPT ============================================================================

EXIT;
