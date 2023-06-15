use std::ops::Deref;
use std::{slice, str};

use crate::OwnedSlice;

/// Wrapper around the raw parts of a `str` so as to ensure reliable layout to
/// pass in/out of WebAssembly.
///
/// # Safety
///
/// This is essentially the same as a `[u8]`, so all invariants from
/// [`std::slice::from_raw_parts`] must be upheld. Additionally, as with a
/// `str`, all pointed to bytes must be valid UTF-8.
#[derive(Clone, Copy)]
#[repr(C)]
pub struct WasmStr(usize, *const u8);

impl Deref for WasmStr {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        // SAFETY: all invariants of `[u8]` & `str` are already required by [`WasmStr`].
        // See the Safety section in its docs.
        unsafe {
            let slice = slice::from_raw_parts(self.1, self.0);
            str::from_utf8_unchecked(slice)
        }
    }
}

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
        // SAFETY: `s` is known to be valid UTF-8 since it comes from a `str`
        let bytes = s.into_boxed_bytes();
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
