using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRazorpayRouteDefaultsAndV2Fields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "business_type",
                table: "razorpay_route_accounts",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "default_percentage",
                table: "razorpay_route_accounts",
                type: "decimal(5,2)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_default_kaizen_vendor",
                table: "razorpay_route_accounts",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "legal_business_name",
                table: "razorpay_route_accounts",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "product_id",
                table: "razorpay_route_accounts",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "razorpay_json",
                table: "razorpay_route_accounts",
                type: "json",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "stakeholder_id",
                table: "razorpay_route_accounts",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "business_type",
                table: "razorpay_route_accounts");

            migrationBuilder.DropColumn(
                name: "default_percentage",
                table: "razorpay_route_accounts");

            migrationBuilder.DropColumn(
                name: "is_default_kaizen_vendor",
                table: "razorpay_route_accounts");

            migrationBuilder.DropColumn(
                name: "legal_business_name",
                table: "razorpay_route_accounts");

            migrationBuilder.DropColumn(
                name: "product_id",
                table: "razorpay_route_accounts");

            migrationBuilder.DropColumn(
                name: "razorpay_json",
                table: "razorpay_route_accounts");

            migrationBuilder.DropColumn(
                name: "stakeholder_id",
                table: "razorpay_route_accounts");
        }
    }
}
