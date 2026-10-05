using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSheetSyncState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "exclude_from_sheet",
                table: "registrations",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "synced_at",
                table: "registrations",
                type: "datetime(6)",
                nullable: true);

            // Backfill: existing completed registrations were historically pushed to the sheet,
            // so mark them as already-synced. This makes rows an admin had already deleted from
            // the sheet stay deleted after the first rebuild (they're detected as missing), while
            // never-completed rows keep synced_at = NULL.
            migrationBuilder.Sql(
                "UPDATE registrations SET synced_at = created_at WHERE payment_status = 'completed';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "exclude_from_sheet",
                table: "registrations");

            migrationBuilder.DropColumn(
                name: "synced_at",
                table: "registrations");
        }
    }
}
