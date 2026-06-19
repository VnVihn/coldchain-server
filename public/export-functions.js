        // Escape CSV field to handle commas, quotes, and newlines
        function escapeCSVField(field) {
            if (field == null) return '';
            const str = String(field);
            // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        // Export CSV by downloading from server (Excel format with address)
        async function exportToCSV() {
            if (!currentVehicleId) {
                alert('Không có thiết bị để xuất dữ liệu');
                return;
            }
            
            const device = getDeviceById(currentVehicleId);
            if (!device) {
                alert('Không tìm thấy thiết bị');
                return;
            }
            
            try {
                // Download Excel file from server (server will handle address resolution)
                window.location.href = `/api/export/${currentVehicleId}`;
                alert('✅ Đang tải xuống file...');
            } catch (error) {
                console.error('Export error:', error);
                alert('❌ Lỗi xuất dữ liệu: ' + error.message);
            }
        }

        // Export to Excel
        function exportToExcel() {
            if (!currentVehicleId) {
                alert('Vui lòng chọn thiết bị trước');
                return;
            }
            
            // Download Excel file từ API
            window.location.href = `/api/export/${currentVehicleId}`;
        }

        // Alias cho hàm cũ
        function exportDeviceData() {
            exportToCSV();
        }
