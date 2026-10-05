using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomRegistrationInvoiceNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "registration_number",
                table: "registrations",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "invoice_next_number",
                table: "campaigns",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "invoice_prefix",
                table: "campaigns",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "registration_id_prefix",
                table: "campaigns",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "registration_next_number",
                table: "campaigns",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "ux_registrations_campaign_reg_number",
                table: "registrations",
                columns: new[] { "campaign_id", "registration_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_registrations_campaign_invoice",
                table: "registrations",
                columns: new[] { "campaign_id", "invoice_number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_registrations_campaign_reg_number",
                table: "registrations");

            migrationBuilder.DropIndex(
                name: "ux_registrations_campaign_invoice",
                table: "registrations");

            migrationBuilder.DropColumn(
                name: "registration_number",
                table: "registrations");

            migrationBuilder.DropColumn(
                name: "invoice_next_number",
                table: "campaigns");

            migrationBuilder.DropColumn(
                name: "invoice_prefix",
                table: "campaigns");

            migrationBuilder.DropColumn(
                name: "registration_id_prefix",
                table: "campaigns");

            migrationBuilder.DropColumn(
                name: "registration_next_number",
                table: "campaigns");
        }
    }
}
