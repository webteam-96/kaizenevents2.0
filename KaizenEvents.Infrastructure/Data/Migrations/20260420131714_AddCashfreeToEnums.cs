using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCashfreeToEnums : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "gateway_type",
                table: "payment_accounts",
                type: "ENUM('instamojo','razorpay','cashfree')",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "ENUM('instamojo','razorpay')")
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AlterColumn<string>(
                name: "payment_gateway",
                table: "campaigns",
                type: "ENUM('razorpay','instamojo','cashfree')",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "ENUM('razorpay','instamojo')")
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "gateway_type",
                table: "payment_accounts",
                type: "ENUM('instamojo','razorpay')",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "ENUM('instamojo','razorpay','cashfree')")
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AlterColumn<string>(
                name: "payment_gateway",
                table: "campaigns",
                type: "ENUM('razorpay','instamojo')",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "ENUM('razorpay','instamojo','cashfree')")
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");
        }
    }
}
