use blackbox_log::frame::{FieldDef, FrameDef};
use blackbox_log::headers::{Firmware, FirmwareVersion};
use blackbox_log::prelude::*;
use blackbox_log::Reader;
use time::PrimitiveDateTime;

use crate::data::WasmDataParser;
use crate::str::WasmStr;
use crate::{OwnedSlice, Shared, WasmByValue};

pub struct WasmHeaders {
    headers: Shared<Headers<'static>>,
    reader: Reader<'static>,
    data: Shared<OwnedSlice<u8>>,
}

impl_boxed_wasm_ffi!(WasmHeaders);

impl WasmHeaders {
    pub(crate) fn new(mut reader: Reader<'static>, data: Shared<OwnedSlice<u8>>) -> Self {
        let headers = match Headers::parse(&mut reader) {
            Ok(headers) => headers,
            Err(err) => crate::throw_headers_parse_error(err),
        };

        Self {
            headers: Shared::new(headers),
            reader,
            data,
        }
    }

    fn get_data_parser(&self) -> WasmDataParser {
        WasmDataParser::new(
            Shared::clone(&self.headers),
            self.reader.clone(),
            Shared::clone(&self.data),
        )
    }

    fn main_def(&self) -> WasmFrameDef {
        WasmFrameDef::from(self.headers.main_frame_def())
    }

    fn slow_def(&self) -> WasmFrameDef {
        WasmFrameDef::from(self.headers.slow_frame_def())
    }

    fn gps_def(&self) -> WasmFrameDef {
        self.headers
            .gps_frame_def()
            .map_or_else(WasmFrameDef::default, WasmFrameDef::from)
    }

    fn unknown(&self) -> OwnedSlice<UnknownHeader> {
        let mut entries = self.headers.unknown().iter().collect::<Vec<_>>();
        entries.sort_unstable_by_key(|(key, _)| *key);
        let entries = entries
            .into_iter()
            .map(|(&key, &value)| UnknownHeader {
                key: key.into(),
                value: value.into(),
            })
            .collect::<Vec<_>>();
        entries.into()
    }
}

#[derive(Default)]
#[repr(transparent)]
struct WasmFrameDef(OwnedSlice<WasmFieldDef>);

impl_boxed_wasm_ffi!(WasmFrameDef);

#[repr(C)]
struct WasmFieldDef {
    name: WasmStr,
    signed: bool,
}

impl<'data, F: FrameDef<'data>> From<&F> for WasmFrameDef {
    fn from(frame: &F) -> Self {
        let mut slice = OwnedSlice::new_zeroed(frame.len());

        for (i, out) in slice.iter_mut().enumerate() {
            let FieldDef { name, signed, .. } = frame.get(i).unwrap();

            *out = WasmFieldDef {
                name: name.into(),
                signed,
            };
        }

        Self(slice)
    }
}

#[derive(Clone)]
#[repr(C)]
struct WasmFirmwareDate {
    discriminant: u32,
    data: WasmFirmwareDateData,
}

// SAFETY: enforced by where clause
unsafe impl WasmByValue for WasmFirmwareDate where WasmFirmwareDateData: WasmByValue {}

impl<'a> From<Option<Result<PrimitiveDateTime, &'a str>>> for WasmFirmwareDate {
    fn from(value: Option<Result<PrimitiveDateTime, &'a str>>) -> Self {
        match value {
            None => Self {
                discriminant: 0,
                data: WasmFirmwareDateData { none: () },
            },
            Some(Ok(date)) => Self {
                discriminant: 1,
                data: WasmFirmwareDateData { ok: date.into() },
            },
            Some(Err(s)) => Self {
                discriminant: 2,
                data: WasmFirmwareDateData { err: s.into() },
            },
        }
    }
}

#[derive(Clone, Copy)]
#[repr(C)]
union WasmFirmwareDateData {
    none: (),
    ok: WasmDate,
    err: WasmStr,
}

// SAFETY: enforced by where clauses
unsafe impl WasmByValue for WasmFirmwareDateData
where
    (): WasmByValue,
    WasmDate: WasmByValue,
    WasmStr: WasmByValue,
{
}

#[derive(Clone, Copy)]
#[repr(C)]
struct WasmDate {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
}

// SAFETY: only contains 32 bit values
unsafe impl WasmByValue for WasmDate {}

impl From<PrimitiveDateTime> for WasmDate {
    fn from(date: PrimitiveDateTime) -> Self {
        Self {
            year: date.year(),
            month: u8::from(date.month()).into(),
            day: date.day().into(),
            hour: date.hour().into(),
            minute: date.minute().into(),
            second: date.second().into(),
        }
    }
}

#[repr(C)]
struct UnknownHeader {
    key: WasmStr,
    value: WasmStr,
}

// SAFETY: enforced by where clauses
unsafe impl WasmByValue for UnknownHeader where WasmStr: WasmByValue {}

fn flag_set_to_wasm_slice<S: blackbox_log::units::FlagSet>(set: S) -> OwnedSlice<WasmStr> {
    set.as_names()
        .into_iter()
        .map(WasmStr::from)
        .collect::<Vec<_>>()
        .into()
}

wasm_export!(free headers_free: Box<WasmHeaders>);
wasm_export!(free frameDef_free: Box<WasmFrameDef>);
wasm_export!(free unknownHeaders_free: OwnedSlice<UnknownHeader>);
wasm_export! {
    fn headers_getDataParser(headers: ref Box<WasmHeaders>) -> Box<WasmDataParser> {
        Box::new(headers.get_data_parser())
    }

    fn headers_mainDef(headers: ref Box<WasmHeaders>) -> Box<WasmFrameDef> {
        Box::new(headers.main_def())
    }

    fn headers_slowDef(headers: ref Box<WasmHeaders>) -> Box<WasmFrameDef> {
        Box::new(headers.slow_def())
    }

    fn headers_gpsDef(headers: ref Box<WasmHeaders>) -> Box<WasmFrameDef> {
        Box::new(headers.gps_def())
    }

    fn headers_firmwareRevision(headers: ref Box<WasmHeaders>) -> WasmStr {
        headers.headers.firmware_revision().into()
    }

    fn headers_firmwareKind(headers: ref Box<WasmHeaders>) -> u32 {
        match headers.headers.firmware() {
            Firmware::Betaflight(_) => 0,
            Firmware::Inav(_) => 1,
        }
    }

    fn headers_firmwareDate(headers: ref Box<WasmHeaders>) -> WasmFirmwareDate {
        headers.headers.firmware_date().into()
    }

    fn headers_firmwareVersion(headers: ref Box<WasmHeaders>) -> [u32; 3] {
        let FirmwareVersion {
            major,
            minor,
            patch,
        } = headers.headers.firmware().version();
        [major.into(), minor.into(), patch.into()]
    }

    fn headers_boardInfo(headers: ref Box<WasmHeaders>) -> WasmStr {
        headers.headers.board_info().into()
    }

    fn headers_craftName(headers: ref Box<WasmHeaders>) -> WasmStr {
        headers.headers.craft_name().into()
    }

    fn headers_debugMode(headers: ref Box<WasmHeaders>) -> WasmStr {
        headers.headers.debug_mode().as_name().into()
    }

    fn headers_disabledFields(headers: ref Box<WasmHeaders>) -> OwnedSlice<WasmStr> {
        flag_set_to_wasm_slice(headers.headers.disabled_fields())
    }

    fn headers_features(headers: ref Box<WasmHeaders>) -> OwnedSlice<WasmStr> {
        flag_set_to_wasm_slice(headers.headers.features())
    }

    fn headers_pwmProtocol(headers: ref Box<WasmHeaders>) -> WasmStr {
        headers.headers.pwm_protocol().as_name().into()
    }

    fn headers_unknown(headers: ref Box<WasmHeaders>) -> OwnedSlice<UnknownHeader> {
        headers.unknown()
    }
}
