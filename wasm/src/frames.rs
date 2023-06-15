use blackbox_log::frame::{FieldDef, FrameDef};

use crate::str::WasmStr;
use crate::units::WasmUnit;
use crate::OwnedSlice;

#[allow(dead_code)]
#[derive(Clone, Copy)]
#[repr(u32)]
pub(crate) enum WasmFrameKind {
    Main = 0,
    Slow = 1,
    Gps = 2,
}

// SAFETY: this is enforced in TS with a union with matching values
unsafe impl crate::ffi::WasmByValue for WasmFrameKind {}

#[derive(Default)]
#[repr(transparent)]
pub(crate) struct WasmFrameDef(OwnedSlice<WasmFieldDef>);

impl_boxed_wasm_ffi!(WasmFrameDef);

#[repr(C)]
struct WasmFieldDef {
    name: WasmStr,
    signed: bool,
    unit: WasmUnit,
}

impl<'data, F: FrameDef<'data>> From<&F> for WasmFrameDef {
    fn from(frame: &F) -> Self {
        let mut slice = OwnedSlice::new_zeroed(frame.len());

        for (i, out) in slice.iter_mut().enumerate() {
            let FieldDef {
                name, signed, unit, ..
            } = frame.get(i).unwrap();

            *out = WasmFieldDef {
                name: name.into(),
                signed,
                unit: unit.into().into(),
            };
        }

        Self(slice)
    }
}
