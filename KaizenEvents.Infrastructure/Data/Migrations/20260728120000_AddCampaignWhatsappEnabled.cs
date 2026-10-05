using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KaizenEvents.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCampaignWhatsappEnabled : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Master WhatsApp switch per campaign. Defaults false (opt-in) so existing
            // campaigns send nothing until an admin explicitly turns WhatsApp on.
            migrationBuilder.AddColumn<bool>(
                name: "whatsapp_enabled",
                table: "campaigns",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "whatsapp_enabled",
                table: "campaigns");
        }
    }
}
