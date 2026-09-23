using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace igaServer.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderPaidNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrderPaidNotifications",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OrderId = table.Column<int>(type: "integer", nullable: false),
                    Channel = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ContactEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AvailableAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LockedUntilUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LockToken = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeadLetteredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderPaidNotifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderPaidNotifications_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderPaidNotifications_AvailableAtUtc_LockedUntilUtc",
                table: "OrderPaidNotifications",
                columns: new[] { "AvailableAtUtc", "LockedUntilUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_OrderPaidNotifications_OrderId_Channel",
                table: "OrderPaidNotifications",
                columns: new[] { "OrderId", "Channel" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderPaidNotifications");
        }
    }
}
