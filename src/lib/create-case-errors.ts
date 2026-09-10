import type { Lang } from "@/lib/i18n";

const messages = {
  quality_bonus: ["Enter a five-star bonus from 0 to 100%, with at most two decimal places. Use 0% for no quality bonus.", "Nhập thưởng 5 sao từ 0 đến 100%, tối đa hai chữ số thập phân. Dùng 0% nếu không có thưởng chất lượng."],
  required: ["Complete the project, Redbrick project, scope of work, and time limits before creating cases.", "Điền dự án, dự án Redbrick, phạm vi công việc và giới hạn thời gian trước khi tạo ca."],
  project: ["Enter or select a project.", "Nhập hoặc chọn dự án."],
  redbrick_project: ["Enter or select a Redbrick project.", "Nhập hoặc chọn dự án Redbrick."],
  scope: ["Enter or select a scope of work.", "Nhập hoặc chọn phạm vi công việc."],
  instructions: ["Add instructions: choose a guide or topic, enter a guideline, or select a scope with a saved template.", "Thêm hướng dẫn: chọn tài liệu hoặc chủ đề, nhập hướng dẫn, hoặc chọn phạm vi có mẫu đã lưu."],
  guide: ["The selected guide no longer exists. Choose another guide or clear the selection.", "Tài liệu đã chọn không còn tồn tại. Chọn tài liệu khác hoặc bỏ lựa chọn."],
  topics: ["The selected topics do not match this Redbrick project and scope, or were removed. Clear them and select matching topics.", "Chủ đề đã chọn không khớp dự án Redbrick và phạm vi, hoặc đã bị xóa. Bỏ chọn và chọn chủ đề phù hợp."],
  no_ids: ["Enter at least one case ID, with each ID on its own line or separated by commas.", "Nhập ít nhất một mã ca, mỗi mã một dòng hoặc cách nhau bằng dấu phẩy."],
  limits: ["Enter positive whole numbers for minimum and maximum minutes. The maximum must be at least the minimum.", "Nhập số phút tối thiểu và tối đa là số nguyên dương. Tối đa phải lớn hơn hoặc bằng tối thiểu."],
  scope_words: ["Shorten the scope of work to 12 words or fewer.", "Rút gọn phạm vi công việc còn tối đa 12 từ."],
  comp_amount: ["Enter a base rate. No default rate is configured for this selection.", "Nhập mức trả cơ bản. Chưa có mức trả mặc định cho lựa chọn này."],
  invalid_amount: ["Enter a valid base rate of zero or more.", "Nhập mức trả cơ bản hợp lệ, lớn hơn hoặc bằng 0."],
  deadline: ["Choose a valid deadline after the current time.", "Chọn hạn chót hợp lệ sau thời điểm hiện tại."],
  expiry: ["Choose an expiry time later than the deadline.", "Chọn thời gian hết hạn sau hạn chót."],
  annotator: ["The selected annotator is no longer available. Choose another annotator or leave the cases unassigned.", "Người gán nhãn đã chọn không còn khả dụng. Chọn người khác hoặc để ca chưa được giao."],
  auth: ["Your session has expired. Sign in again in another tab, then retry here to keep your entries.", "Phiên đăng nhập đã hết hạn. Đăng nhập lại trong tab khác, rồi thử lại tại đây để giữ nội dung đã nhập."],
  forbidden: ["Only reviewers can create cases. Ask a reviewer to create them or check your account role.", "Chỉ người đánh giá có thể tạo ca. Nhờ người đánh giá tạo ca hoặc kiểm tra vai trò tài khoản."],
  conflict: ["A case with this ID, Redbrick project and scope already exists. Refresh the case list and check the existing cases before retrying.", "Ca với mã, dự án Redbrick và phạm vi này đã tồn tại. Làm mới danh sách và kiểm tra ca hiện có trước khi thử lại."],
  server: ["The server could not finish creating cases. Check the case list before retrying: some cases or attachments may already have been saved. Share the reference below if this continues.", "Máy chủ không thể hoàn tất tạo ca. Kiểm tra danh sách trước khi thử lại: một số ca hoặc tệp có thể đã được lưu. Gửi mã tham chiếu bên dưới nếu lỗi tiếp diễn."],
  network: ["The request could not be completed. Check your connection and the case list before retrying. If you attached a large folder, try fewer files (under 15 MB total). Your entries are still here.", "Không thể hoàn tất yêu cầu. Kiểm tra kết nối và danh sách ca trước khi thử lại. Nếu đính kèm thư mục lớn, thử ít tệp hơn (tổng dưới 15 MB). Nội dung đã nhập vẫn được giữ."],
  upload_size: ["The attachments are too large. Select fewer files (under 15 MB total), then try again.", "Tệp đính kèm quá lớn. Chọn ít tệp hơn (tổng dưới 15 MB) rồi thử lại."],
} as const;
export type CreateCaseError = keyof typeof messages;
export function createCaseErrorMessage(error: CreateCaseError, lang: Lang) {
  return messages[error][lang === "vi" ? 1 : 0];
}
