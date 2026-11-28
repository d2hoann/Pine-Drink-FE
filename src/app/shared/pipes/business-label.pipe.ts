import { Pipe, PipeTransform } from '@angular/core';

const labels: Record<string, Record<string, string>> = {
  order: {
    PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', PREPARING: 'Đang pha chế',
    READY: 'Đã chuẩn bị', DELIVERING: 'Đang giao', COMPLETED: 'Hoàn tất',
    CANCELLED: 'Đã hủy', REJECTED: 'Đã từ chối', PAID: 'Đã thanh toán',
    CREATED: 'Đã tạo đơn', REFUNDED: 'Đã hoàn tiền'
  },
  payment: { PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán', REFUNDED: 'Đã hoàn tiền' },
  paymentMethod: {
    CASH: 'Tiền mặt', COD: 'Thanh toán khi nhận hàng', BANK_TRANSFER: 'Chuyển khoản',
    MOMO: 'Ví MoMo', VNPAY: 'VNPay', VNPAY_QR: 'VNPay QR', QRCODE: 'Mã QR',
    APP_WALLET: 'Ví điện tử', CAPTUREWALLET: 'Ví điện tử', CREDIT: 'Thẻ tín dụng', ATM: 'Thẻ ngân hàng'
  },
  fulfillment: { DELIVERY: 'Giao hàng', PICKUP: 'Nhận tại quầy', WALK_IN: 'Mua tại quầy' },
  priority: { NORMAL: 'Thông thường', HIGH: 'Cao', URGENT: 'Khẩn cấp' },
  product: { ACTIVE: 'Đang bán', INACTIVE: 'Tạm ẩn', OUT_OF_STOCK: 'Hết hàng' },
  promotion: { ACTIVE: 'Đang áp dụng', INACTIVE: 'Đã tắt', EXPIRED: 'Đã hết hạn' },
  stock: {
    SET_QUOTA: 'Đặt hạn mức', COPY_QUOTA: 'Sao chép hạn mức', ADJUST: 'Điều chỉnh hạn mức',
    RESERVE: 'Giữ hàng', SOLD: 'Ghi nhận đã bán', RELEASE: 'Hủy giữ hàng'
  },
  role: {
    ALL: 'Tất cả', ADMIN: 'Quản trị viên', MANAGER: 'Quản lý',
    DELIVERY: 'Nhân viên giao hàng', STAFF: 'Nhân viên', CUSTOMER: 'Khách hàng'
  },
  account: {
    ALL: 'Tất cả', ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động',
    PENDING: 'Chờ xác minh', LOCKED: 'Đã khóa'
  },
  branch: { ACTIVE: 'Đang hoạt động', INACTIVE: 'Tạm ngưng', MAINTENANCE: 'Bảo trì', CLOSED: 'Đã đóng' },
  module: {
    ALL: 'Tất cả phân hệ', GENERAL: 'Chung', ACCOUNT: 'Tài khoản', BRANCH: 'Chi nhánh',
    PROFILE: 'Hồ sơ cá nhân', CUSTOMER_ADDRESS: 'Địa chỉ khách hàng', FILE: 'Tệp',
    GEOCODING: 'Bản đồ và địa chỉ', AUTHORIZATION: 'Phân quyền', PRODUCT: 'Sản phẩm',
    CATEGORY: 'Danh mục sản phẩm', TOPPING: 'Phần thêm', VOUCHER: 'Mã giảm giá',
    ORDER: 'Đơn hàng', REPORT: 'Báo cáo', ATTENDANCE: 'Chấm công', PAYROLL: 'Tiền lương'
  }
};

@Pipe({ name: 'businessLabel', standalone: true })
export class BusinessLabelPipe implements PipeTransform {
  transform(value: string | null | undefined, group: string, fallback?: string): string {
    if (!value) return 'Chưa cập nhật';
    const code = value.toUpperCase().replace(/^ROLE_/, '');
    return labels[group]?.[code] ?? fallback ?? 'Chưa xác định';
  }
}
