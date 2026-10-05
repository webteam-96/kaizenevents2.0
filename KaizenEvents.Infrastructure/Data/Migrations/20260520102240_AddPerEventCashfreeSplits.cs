using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPerEventCashfreeSplits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Legacy commission/settlement split rows can't be mapped 1:1 into the new
            // (split_type, value) shape — wipe and let super admins re-configure each
            // Cashfree event from the Payment Splits section.
            migrationBuilder.Sql("DELETE FROM campaign_vendor_splits;");

            migrationBuilder.DropColumn(
                name: "percentage",
                table: "campaign_vendor_splits");

            migrationBuilder.RenameColumn(
                name: "role",
                table: "campaign_vendor_splits",
                newName: "split_type");

            migrationBuilder.AddColumn<decimal>(
                name: "default_percentage",
                table: "cashfree_kyc",
                type: "decimal(5,2)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_default_kaizen_vendor",
                table: "cashfree_kyc",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "value",
                table: "campaign_vendor_splits",
                type: "decimal(10,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "default_percentage",
                table: "cashfree_kyc");

            migrationBuilder.DropColumn(
                name: "is_default_kaizen_vendor",
                table: "cashfree_kyc");

            migrationBuilder.DropColumn(
                name: "value",
                table: "campaign_vendor_splits");

            migrationBuilder.RenameColumn(
                name: "split_type",
                table: "campaign_vendor_splits",
                newName: "role");

            migrationBuilder.AddColumn<decimal>(
                name: "percentage",
                table: "campaign_vendor_splits",
                type: "decimal(5,2)",
                nullable: false,
                defaultValue: 0m);
        }
    }
}
