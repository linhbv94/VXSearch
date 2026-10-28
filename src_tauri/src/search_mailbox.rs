use search_core::AppError;
use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct PendingSearch {
    pub id: u64,
    pub query: String,
}
#[derive(Default)]
pub struct SearchMailbox {
    sequence: u64,
    pending: Option<PendingSearch>,
}
impl SearchMailbox {
    pub fn submit(&mut self, query: String) -> Result<PendingSearch, AppError> {
        if query.trim().is_empty() || query.len() > 2048 || query.contains('\0') {
            return Err(AppError::new(
                "E_INVALID_QUERY",
                "Nhập từ khóa tối đa 2048 byte.",
            ));
        }
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or_else(|| AppError::new("E_INTERNAL", "Không thể tạo yêu cầu tìm kiếm."))?;
        let request = PendingSearch {
            id: self.sequence,
            query,
        };
        self.pending = Some(request.clone());
        Ok(request)
    }
    pub fn pending(&self) -> Option<PendingSearch> {
        self.pending.clone()
    }
    pub fn acknowledge(&mut self, id: u64) {
        if self.pending.as_ref().is_some_and(|p| p.id == id) {
            self.pending = None;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cold_main_can_receive_pending_query_and_old_ack_cannot_erase_new_query() {
        let mut mailbox = SearchMailbox::default();
        let first = mailbox.submit("Báo cáo .pdf".into()).unwrap();
        assert_eq!(mailbox.pending(), Some(first.clone()));
        let next = mailbox.submit("  ảnh #2026  ".into()).unwrap();
        mailbox.acknowledge(first.id);
        assert_eq!(mailbox.pending(), Some(next.clone()));
        mailbox.acknowledge(next.id);
        assert!(mailbox.pending().is_none());
    }
    #[test]
    fn invalid_submission_preserves_previous_pending_query() {
        let mut mailbox = SearchMailbox::default();
        let first = mailbox.submit("notes".into()).unwrap();
        for query in [" \n".to_owned(), "a\0b".to_owned(), "đ".repeat(1025)] {
            assert!(mailbox.submit(query).is_err());
        }
        assert_eq!(mailbox.pending(), Some(first));
    }
}
