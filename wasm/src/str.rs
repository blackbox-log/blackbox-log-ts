use crate::OwnedSlice;

#[derive(Clone, Copy)]
#[repr(C)]
pub struct WasmStr(usize, *const u8);

impl From<&str> for WasmStr {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.len(), s.as_ptr())
    }
}

impl From<Option<&str>> for WasmStr {
    #[inline]
    fn from(s: Option<&str>) -> Self {
        s.map_or(Self(0, std::ptr::null()), Self::from)
    }
}

// SAFETY: requires multi-value returns
unsafe impl crate::WasmByValue for WasmStr {}

#[repr(transparent)]
pub struct OwnedWasmStr(OwnedSlice<u8>);

impl From<String> for OwnedWasmStr {
    fn from(s: String) -> Self {
        Self::from(s.into_boxed_str())
    }
}

impl From<Box<str>> for OwnedWasmStr {
    fn from(s: Box<str>) -> Self {
        Self::from(s.into_boxed_bytes())
    }
}

impl From<Box<[u8]>> for OwnedWasmStr {
    fn from(bytes: Box<[u8]>) -> Self {
        Self(bytes.into())
    }
}

#[cfg(test)]
mod tests {
    use std::mem;

    use super::*;

    #[test]
    fn owned_str_option_niche() {
        assert_eq!(
            mem::size_of::<OwnedWasmStr>(),
            mem::size_of::<Option<OwnedWasmStr>>()
        );
        assert_eq!(
            mem::align_of::<OwnedWasmStr>(),
            mem::align_of::<Option<OwnedWasmStr>>()
        );
    }
}
