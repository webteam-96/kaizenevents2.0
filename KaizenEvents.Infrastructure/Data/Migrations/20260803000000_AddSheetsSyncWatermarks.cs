using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSheetsSyncWatermarks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // What the app last wrote to each campaign's sheet. Two jobs:
            //  • row count  — lets a rebuild distinguish "admin deleted every row" from
            //                 "sheet was never populated", so deleting the last row sticks.
            //  • col count  — marks where the generated columns end; everything to the right
            //                 is the admin's own working area and survives rebuilds.
            // Both default to 0 ("nothing written yet"), which reproduces today's behaviour
            // for existing sheets until their next sync stamps a real value.
            migrationBuilder.AddColumn<int>(
                name: "last_synced_row_count",
                table: "sheets_configs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "last_synced_col_count",
                table: "sheets_configs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Backfill the row watermark for sheets that provably already hold rows — i.e. the
            // campaign has registrations stamped as synced. Without this, the first sync after
            // deployment would still lose a last-row deletion, because a 0 watermark reads as
            // "never populated". The value is a floor, not a count: the next rebuild replaces it
            // with the exact number. Deliberately not backfilling the column watermark — there is
            // no way to know the width at the time of writing, and 0 falls back safely.
            migrationBuilder.Sql(@"
                UPDATE sheets_configs sc
                SET sc.last_synced_row_count = 1
                WHERE sc.spreadsheet_id IS NOT NULL
                  AND sc.spreadsheet_id <> ''
                  AND EXISTS (
                      SELECT 1 FROM registrations r
                      WHERE r.campaign_id = sc.campaign_id
                        AND r.synced_at IS NOT NULL
                  );");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "last_synced_row_count",
                table: "sheets_configs");

            migrationBuilder.DropColumn(
                name: "last_synced_col_count",
                table: "sheets_configs");
        }
    }
}
