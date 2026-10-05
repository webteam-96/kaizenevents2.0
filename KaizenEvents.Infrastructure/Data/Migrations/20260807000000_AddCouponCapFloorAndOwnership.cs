using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCouponCapFloorAndOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Cap and floor on the rupee value of a discount. Both nullable = no limit,
            // which is exactly how every existing coupon behaves today, so this is a
            // no-op for rows already in the table.
            migrationBuilder.AddColumn<decimal>(
                name: "max_discount_amount",
                table: "coupon_codes",
                type: "decimal(12,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "min_discount_amount",
                table: "coupon_codes",
                type: "decimal(12,2)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "coupon_codes",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            // Ownership. Existing rows keep NULL, which the API treats as super-admin-only
            // rather than as "visible to everyone" — the safer default for a secret code.
            migrationBuilder.AddColumn<string>(
                name: "created_by",
                table: "coupon_codes",
                type: "varchar(36)",
                maxLength: 36,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<System.DateTime>(
                name: "updated_at",
                table: "coupon_codes",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "idx_coupon_campaign_creator",
                table: "coupon_codes",
                columns: new[] { "campaign_id", "created_by" });

            // What the coupon actually took off this registration. Defaults to 0, so
            // historical registrations report a zero discount rather than a wrong one —
            // the pre-existing rows genuinely have no recorded discount to report.
            migrationBuilder.AddColumn<decimal>(
                name: "coupon_discount",
                table: "registrations",
                type: "decimal(12,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateIndex(
                name: "idx_registrations_coupon",
                table: "registrations",
                column: "coupon_code");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "idx_registrations_coupon",
                table: "registrations");

            migrationBuilder.DropColumn(
                name: "coupon_discount",
                table: "registrations");

            migrationBuilder.DropIndex(
                name: "idx_coupon_campaign_creator",
                table: "coupon_codes");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "coupon_codes");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "coupon_codes");

            migrationBuilder.DropColumn(
                name: "description",
                table: "coupon_codes");

            migrationBuilder.DropColumn(
                name: "min_discount_amount",
                table: "coupon_codes");

            migrationBuilder.DropColumn(
                name: "max_discount_amount",
                table: "coupon_codes");
        }
    }
}
