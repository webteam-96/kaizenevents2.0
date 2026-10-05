using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRazorpaySettlementMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Razorpay-only settlement mode: "route" (default, current Route/splits
            // behavior, unchanged) vs "single_account" (plain order, no transfers — money
            // collects wholesale and is paid out later via the existing Fund Transfer flow
            // instead). Defaults to "route" everywhere, so this is a zero-behavior-change
            // migration for every existing account.
            migrationBuilder.AddColumn<string>(
                name: "razorpay_settlement_mode",
                table: "payment_accounts",
                type: "varchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "route")
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "razorpay_settlement_mode",
                table: "payment_accounts");
        }
    }
}
