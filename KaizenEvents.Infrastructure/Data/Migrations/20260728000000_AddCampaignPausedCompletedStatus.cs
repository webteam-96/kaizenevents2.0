using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCampaignPausedCompletedStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Widen the campaigns.status ENUM to add 'paused' and 'completed'.
            migrationBuilder.AlterColumn<string>(
                name: "status",
                table: "campaigns",
                type: "ENUM('draft','active','paused','completed','closed','archived')",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "ENUM('draft','active','closed','archived')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Collapse any 'paused'/'completed' rows back to a value the old ENUM allows
            // so the narrowing ALTER does not fail on existing data.
            migrationBuilder.Sql("UPDATE `campaigns` SET `status` = 'closed' WHERE `status` IN ('paused','completed');");

            migrationBuilder.AlterColumn<string>(
                name: "status",
                table: "campaigns",
                type: "ENUM('draft','active','closed','archived')",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "ENUM('draft','active','paused','completed','closed','archived')");
        }
    }
}
