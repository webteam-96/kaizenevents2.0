-- ============================================================================
-- Kaizen Events — Payment Detail Tables (Finance Archive)
-- ============================================================================
-- Per-gateway raw transaction archive used by the finance team.
-- Mirrors the old Kaizen Infotech project's instamojo_* tables.
-- Same column shape replicated for razorpay_* and cashfree_* (no historical
-- data exists for those — fresh tables ready for new payments).
--
-- Run order: TitleTable -> BankDetails -> PaymentDetails -> DataDetails
--   (Instamojo first, then Razorpay, then Cashfree.)
--
-- WARNING: This script CREATEs only — does not DROP. To re-run on an existing
-- DB, drop the matching tables first:
--   DROP TABLE IF EXISTS instamojo_datadetails, instamojo_payment_details,
--                        instamojo_paymenttitle_bank_details, instamojo_paymenttitle;
--   (Repeat for razorpay_*, cashfree_*.)
-- ============================================================================

-- ============================================================================
-- SECTION 1: INSTAMOJO  (faithful copy of old project's schema)
-- ============================================================================

-- ─── 1A. Master "Title" table — one row per event/payment-purpose ───────────
CREATE TABLE `instamojo_paymenttitle` (
  `pk_title_id`   int           NOT NULL AUTO_INCREMENT,
  `Title`         varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createddate`   datetime      DEFAULT NULL,
  `modifieddate`  datetime      DEFAULT NULL,
  `isdeleted`     int           DEFAULT NULL,
  `IsActive`      int           DEFAULT NULL,
  `payee`         varchar(500)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_details`  varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`pk_title_id`),
  KEY `indx_instamojo_paymenttitle_TITLE` (`Title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 1B. Bank account per title ─────────────────────────────────────────────
CREATE TABLE `instamojo_paymenttitle_bank_details` (
  `pk_purposetitle_bank_details_id` int NOT NULL AUTO_INCREMENT,
  `fk_title_id`     int           DEFAULT NULL,
  `account_name`    varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name`       varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number`  varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_branch`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ifsc_code`       varchar(100)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdby`       int           DEFAULT NULL,
  `createddate`     datetime      DEFAULT NULL,
  `modifiedby`      int           DEFAULT NULL,
  `modifieddate`    datetime      DEFAULT NULL,
  `deletedby`       int           DEFAULT NULL,
  `deleteddate`     datetime      DEFAULT NULL,
  `isdeleted`       int           DEFAULT NULL,
  PRIMARY KEY (`pk_purposetitle_bank_details_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 1C. Payout/credit summary per title ────────────────────────────────────
CREATE TABLE `instamojo_payment_details` (
  `pk_payment_id`                   int           NOT NULL AUTO_INCREMENT,
  `fk_title_id`                     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount`                          decimal(10,2) DEFAULT NULL,
  `createddate`                     datetime      DEFAULT NULL,
  `modifieddate`                    datetime      DEFAULT NULL,
  `remark`                          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isdeleted`                       int           DEFAULT NULL,
  `fk_purposetitle_bank_details_id` int           DEFAULT NULL,
  PRIMARY KEY (`pk_payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 1D. Per-transaction raw log ────────────────────────────────────────────
CREATE TABLE `instamojo_datadetails` (
  `pk_instamojodetail_id`  int           NOT NULL AUTO_INCREMENT,
  `Payment_ID`             varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Transaction_Date`       datetime      DEFAULT NULL,
  `Transaction_Type`       varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Payout_ID`              varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Payout_date`            datetime      DEFAULT NULL,
  `Title`                  varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Name`             varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Email_Address`    varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Phone_Number`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Quantity_Sold`          int           DEFAULT NULL,
  `Sale_currency`          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Sale_Amount`            int           DEFAULT NULL,
  `Affiliate_Fees`         int           DEFAULT NULL,
  `Instamojo_Fees`         float         DEFAULT NULL,
  `Total_Tax`              float         DEFAULT NULL,
  `Related_case`           varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CreatedDate`            datetime      DEFAULT NULL,
  `ModifiedDate`           datetime      DEFAULT NULL,
  `payment_instrument`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_type`           varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_status`          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_flag`            int           NOT NULL,
  `fk_title_id`            int(10) unsigned zerofill NOT NULL,
  `isdeleted`              int           DEFAULT NULL,
  `refund_status`          int(10) unsigned zerofill DEFAULT NULL,
  `billing_instrument`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- Bridge to operational `payments` table (new)
  `linked_payment_uuid`    char(36)      COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`pk_instamojodetail_id`),
  KEY `inx_instamojo_datadetails_PAYMENT_ID` (`Payment_ID`),
  KEY `idx_instamojo_datadetails_TITLE` (`Title`),
  KEY `idx_instamojo_datadetails_linked_payment_uuid` (`linked_payment_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- SECTION 2: RAZORPAY  (same shape; Instamojo_Fees → Razorpay_Fees)
-- ============================================================================

CREATE TABLE `razorpay_paymenttitle` (
  `pk_title_id`   int           NOT NULL AUTO_INCREMENT,
  `Title`         varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createddate`   datetime      DEFAULT NULL,
  `modifieddate`  datetime      DEFAULT NULL,
  `isdeleted`     int           DEFAULT NULL,
  `IsActive`      int           DEFAULT NULL,
  `payee`         varchar(500)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_details`  varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`pk_title_id`),
  KEY `indx_razorpay_paymenttitle_TITLE` (`Title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `razorpay_paymenttitle_bank_details` (
  `pk_purposetitle_bank_details_id` int NOT NULL AUTO_INCREMENT,
  `fk_title_id`     int           DEFAULT NULL,
  `account_name`    varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name`       varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number`  varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_branch`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ifsc_code`       varchar(100)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdby`       int           DEFAULT NULL,
  `createddate`     datetime      DEFAULT NULL,
  `modifiedby`      int           DEFAULT NULL,
  `modifieddate`    datetime      DEFAULT NULL,
  `deletedby`       int           DEFAULT NULL,
  `deleteddate`     datetime      DEFAULT NULL,
  `isdeleted`       int           DEFAULT NULL,
  PRIMARY KEY (`pk_purposetitle_bank_details_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `razorpay_payment_details` (
  `pk_payment_id`                   int           NOT NULL AUTO_INCREMENT,
  `fk_title_id`                     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount`                          decimal(10,2) DEFAULT NULL,
  `createddate`                     datetime      DEFAULT NULL,
  `modifieddate`                    datetime      DEFAULT NULL,
  `remark`                          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isdeleted`                       int           DEFAULT NULL,
  `fk_purposetitle_bank_details_id` int           DEFAULT NULL,
  PRIMARY KEY (`pk_payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `razorpay_datadetails` (
  `pk_razorpaydetail_id`   int           NOT NULL AUTO_INCREMENT,
  `Payment_ID`             varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Transaction_Date`       datetime      DEFAULT NULL,
  `Transaction_Type`       varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Payout_ID`              varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Payout_date`            datetime      DEFAULT NULL,
  `Title`                  varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Name`             varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Email_Address`    varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Phone_Number`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Quantity_Sold`          int           DEFAULT NULL,
  `Sale_currency`          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Sale_Amount`            int           DEFAULT NULL,
  `Affiliate_Fees`         int           DEFAULT NULL,         -- Always NULL for Razorpay (no marketplace concept)
  `Razorpay_Fees`          float         DEFAULT NULL,
  `Total_Tax`              float         DEFAULT NULL,
  `Related_case`           varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CreatedDate`            datetime      DEFAULT NULL,
  `ModifiedDate`           datetime      DEFAULT NULL,
  `payment_instrument`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_type`           varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_status`          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_flag`            int           NOT NULL DEFAULT 0,
  `fk_title_id`            int           NOT NULL DEFAULT 0,    -- Plain int (no zerofill)
  `isdeleted`              int           DEFAULT NULL,
  `refund_status`          int           DEFAULT NULL,
  `billing_instrument`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_payment_uuid`    char(36)      COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`pk_razorpaydetail_id`),
  KEY `inx_razorpay_datadetails_PAYMENT_ID` (`Payment_ID`),
  KEY `idx_razorpay_datadetails_TITLE` (`Title`),
  KEY `idx_razorpay_datadetails_linked_payment_uuid` (`linked_payment_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- SECTION 3: CASHFREE  (same shape; Instamojo_Fees → Cashfree_Fees)
-- ============================================================================

CREATE TABLE `cashfree_paymenttitle` (
  `pk_title_id`   int           NOT NULL AUTO_INCREMENT,
  `Title`         varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createddate`   datetime      DEFAULT NULL,
  `modifieddate`  datetime      DEFAULT NULL,
  `isdeleted`     int           DEFAULT NULL,
  `IsActive`      int           DEFAULT NULL,
  `payee`         varchar(500)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_details`  varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`pk_title_id`),
  KEY `indx_cashfree_paymenttitle_TITLE` (`Title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cashfree_paymenttitle_bank_details` (
  `pk_purposetitle_bank_details_id` int NOT NULL AUTO_INCREMENT,
  `fk_title_id`     int           DEFAULT NULL,
  `account_name`    varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name`       varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number`  varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_branch`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ifsc_code`       varchar(100)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdby`       int           DEFAULT NULL,
  `createddate`     datetime      DEFAULT NULL,
  `modifiedby`      int           DEFAULT NULL,
  `modifieddate`    datetime      DEFAULT NULL,
  `deletedby`       int           DEFAULT NULL,
  `deleteddate`     datetime      DEFAULT NULL,
  `isdeleted`       int           DEFAULT NULL,
  PRIMARY KEY (`pk_purposetitle_bank_details_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cashfree_payment_details` (
  `pk_payment_id`                   int           NOT NULL AUTO_INCREMENT,
  `fk_title_id`                     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount`                          decimal(10,2) DEFAULT NULL,
  `createddate`                     datetime      DEFAULT NULL,
  `modifieddate`                    datetime      DEFAULT NULL,
  `remark`                          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isdeleted`                       int           DEFAULT NULL,
  `fk_purposetitle_bank_details_id` int           DEFAULT NULL,
  PRIMARY KEY (`pk_payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cashfree_datadetails` (
  `pk_cashfreedetail_id`   int           NOT NULL AUTO_INCREMENT,
  `Payment_ID`             varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Transaction_Date`       datetime      DEFAULT NULL,
  `Transaction_Type`       varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Payout_ID`              varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Payout_date`            datetime      DEFAULT NULL,
  `Title`                  varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Name`             varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Email_Address`    varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Buyer_Phone_Number`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Quantity_Sold`          int           DEFAULT NULL,
  `Sale_currency`          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Sale_Amount`            int           DEFAULT NULL,
  `Affiliate_Fees`         int           DEFAULT NULL,         -- Always NULL for Cashfree
  `Cashfree_Fees`          float         DEFAULT NULL,
  `Total_Tax`              float         DEFAULT NULL,
  `Related_case`           varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CreatedDate`            datetime      DEFAULT NULL,
  `ModifiedDate`           datetime      DEFAULT NULL,
  `payment_instrument`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_type`           varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_status`          varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_flag`            int           NOT NULL DEFAULT 0,
  `fk_title_id`            int           NOT NULL DEFAULT 0,
  `isdeleted`              int           DEFAULT NULL,
  `refund_status`          int           DEFAULT NULL,
  `billing_instrument`     varchar(200)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_payment_uuid`    char(36)      COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`pk_cashfreedetail_id`),
  KEY `inx_cashfree_datadetails_PAYMENT_ID` (`Payment_ID`),
  KEY `idx_cashfree_datadetails_TITLE` (`Title`),
  KEY `idx_cashfree_datadetails_linked_payment_uuid` (`linked_payment_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DONE. 12 tables created (4 per gateway × 3 gateways).
-- Verify with:  SHOW TABLES LIKE '%_datadetails';   -- should list 3
--               SHOW TABLES LIKE '%_paymenttitle';  -- should list 3
-- ============================================================================
