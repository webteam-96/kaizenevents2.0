-- Payment Gateway Proxy - Database Setup
-- Run this once on the gateway server database

CREATE DATABASE IF NOT EXISTS `kaizen_payment_gateway`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `kaizen_payment_gateway`;

CREATE TABLE IF NOT EXISTS `pg_transactions` (
    `id`                  INT            NOT NULL AUTO_INCREMENT,
    `project_key`         VARCHAR(50)    NOT NULL,
    `order_id`            VARCHAR(100)   NOT NULL,
    `payment_session_id`  VARCHAR(255)   NOT NULL,
    `amount`              DECIMAL(10, 2) NULL     DEFAULT NULL,
    `currency`            VARCHAR(10)    NOT NULL DEFAULT 'INR',
    `customer_name`       VARCHAR(100)   NULL     DEFAULT NULL,
    `customer_email`      VARCHAR(100)   NULL     DEFAULT NULL,
    `customer_phone`      VARCHAR(20)    NULL     DEFAULT NULL,
    `payment_status`      VARCHAR(50)    NOT NULL DEFAULT 'PENDING',
    `cashfree_response`   TEXT           NULL     DEFAULT NULL,
    `return_url`          TEXT           NOT NULL,
    `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_order_id` (`order_id`),
    INDEX `idx_project_key` (`project_key`),
    INDEX `idx_payment_status` (`payment_status`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
