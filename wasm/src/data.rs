use std::mem::ManuallyDrop;
use std::pin::Pin;

use blackbox_log::data::Stats;
use blackbox_log::frame::{Frame, GpsFrame, MainFrame, SlowFrame};
use blackbox_log::prelude::*;
use blackbox_log::units::{si, Time};
use blackbox_log::Reader;

use crate::headers::WasmHeaders;
use crate::{IntoWasmFfi, OwnedSlice, Shared, WasmByValue, WasmFfi};

// SAFETY: field order *must* be `parser` first, then `headers`, then `data` to
// ensure correct drop order
pub struct WasmDataParser {
    parsed: Pin<Box<WasmParseEvent>>,
    parser: DataParser<'static, 'static>,
    _headers: Shared<Headers<'static>>,
    _data: Shared<OwnedSlice<u8>>,
}

impl_boxed_wasm_ffi!(WasmDataParser);

impl WasmDataParser {
    pub(crate) fn new(
        headers: Shared<Headers<'static>>,
        reader: Reader<'static>,
        data: Shared<OwnedSlice<u8>>,
    ) -> Self {
        // SAFETY: this is only used to create the `DataParser`, which is guaranteed to
        // be dropped before `headers` by the declaration order in the struct
        let headers_ref = unsafe { headers.deref_static() };

        Self {
            parsed: Box::pin(WasmParseEvent::default()),
            parser: DataParser::new(reader, headers_ref),
            _headers: headers,
            _data: data,
        }
    }

    fn result_ptr(&self) -> *const WasmParseEvent {
        let parsed: &WasmParseEvent = &self.parsed;
        parsed
    }

    fn stats(&self) -> &Stats {
        self.parser.stats()
    }

    fn next(&mut self) {
        let parsed = self.parser.next();
        *self.parsed = parsed.into();
    }
}

impl_structural! {
    #[repr(C)]
    pub struct WasmParseEvent {
        kind: WasmParseEventKind,
        data: WasmParseEventData,
    }
}

impl_structural! {
    #[repr(u8)]
    enum WasmParseEventKind {
        None = 0,
        Event,
        Main,
        Slow,
        Gps,
    }
}

#[repr(C)]
union WasmParseEventData {
    none: (),
    event: (),
    main: ManuallyDrop<DataMain>,
    slow: ManuallyDrop<DataSlow>,
    gps: ManuallyDrop<DataGps>,
}

// SAFETY: bounds guarantee all fields also impl Structural, repr(C) guarantees
// known memory layout
unsafe impl crate::Structural for WasmParseEventData
where
    (): crate::Structural,
    DataMain: crate::Structural,
    DataSlow: crate::Structural,
    DataGps: crate::Structural,
{
}

impl_structural! {
    #[repr(transparent)]
    struct Fields(OwnedSlice<u32>);
}

impl_structural! {
    #[repr(C)]
    struct DataMain {
        time: f64,
        fields: Fields,
    }

    #[repr(C)]
    struct DataSlow {
        fields: Fields,
    }

    #[repr(C)]
    struct DataGps {
        time: f64,
        fields: Fields,
    }
}

impl Drop for WasmParseEvent {
    fn drop(&mut self) {
        use {WasmParseEventData as Data, WasmParseEventKind as Kind};

        // SAFETY: data & kind get set together and will always match
        unsafe {
            #[allow(clippy::unneeded_field_pattern)]
            #[allow(clippy::match_same_arms)]
            match (&self.kind, &mut self.data) {
                (Kind::None, Data { none: _ }) => {}
                (Kind::Event, Data { event: _ }) => {}
                (Kind::Main, Data { main }) => ManuallyDrop::drop(main),
                (Kind::Slow, Data { slow }) => ManuallyDrop::drop(slow),
                (Kind::Gps, Data { gps }) => ManuallyDrop::drop(gps),
            }
        }
    }
}

impl Default for WasmParseEvent {
    fn default() -> Self {
        Self {
            kind: WasmParseEventKind::None,
            data: WasmParseEventData { none: () },
        }
    }
}

impl From<Option<ParserEvent<'_, '_, '_>>> for WasmParseEvent {
    fn from(event: Option<ParserEvent>) -> Self {
        let Some(event) = event else {
            return Self::default();
        };

        match event {
            ParserEvent::Event(_) => Self {
                kind: WasmParseEventKind::Event,
                data: WasmParseEventData { event: () },
            },
            ParserEvent::Main(main) => Self {
                kind: WasmParseEventKind::Main,
                data: WasmParseEventData {
                    main: ManuallyDrop::new(main.into()),
                },
            },
            ParserEvent::Slow(slow) => Self {
                kind: WasmParseEventKind::Slow,
                data: WasmParseEventData {
                    slow: ManuallyDrop::new(slow.into()),
                },
            },
            ParserEvent::Gps(gps) => Self {
                kind: WasmParseEventKind::Gps,
                data: WasmParseEventData {
                    gps: ManuallyDrop::new(gps.into()),
                },
            },
        }
    }
}

fn get_time(time: Time) -> f64 {
    time.get::<si::time::second>()
}

impl From<MainFrame<'_, '_, '_>> for DataMain {
    fn from(frame: MainFrame) -> Self {
        Self {
            time: get_time(frame.time()),
            fields: Fields::from(frame),
        }
    }
}

impl From<SlowFrame<'_, '_, '_>> for DataSlow {
    fn from(frame: SlowFrame) -> Self {
        Self {
            fields: Fields::from(frame),
        }
    }
}

impl From<GpsFrame<'_, '_, '_>> for DataGps {
    fn from(frame: GpsFrame) -> Self {
        Self {
            time: get_time(frame.time()),
            fields: Fields::from(frame),
        }
    }
}

impl<F: Frame> From<F> for Fields {
    fn from(frame: F) -> Self {
        let mut slice = OwnedSlice::new_zeroed(frame.len());

        for (i, out) in slice.iter_mut().enumerate() {
            *out = frame.get_raw(i).unwrap();
        }

        Self(slice)
    }
}

#[repr(C)]
struct DataNew(
    <Box<WasmDataParser> as WasmFfi>::Ffi,
    <*const WasmParseEvent as WasmFfi>::Ffi,
);

// SAFETY: repr(C) & where bounds for each field
unsafe impl WasmByValue for DataNew
where
    <Box<WasmDataParser> as WasmFfi>::Ffi: WasmByValue,
    <*const WasmParseEvent as WasmFfi>::Ffi: WasmByValue,
{
}

#[repr(C)]
struct WasmDataStats {
    count_event: usize,
    count_main: usize,
    count_slow: usize,
    count_gps: usize,
    count_gps_home: usize,
    progress: f32,
}

// SAFETY: repr(C) & where bounds for each field
unsafe impl WasmByValue for WasmDataStats
where
    <usize as WasmFfi>::Ffi: WasmByValue,
    <f32 as WasmFfi>::Ffi: WasmByValue,
{
}

wasm_export!(free data_free: Box<WasmDataParser>);
wasm_export! {
    fn data_new(headers: ref Box<WasmHeaders>) -> DataNew {
        let data = Box::new(headers.get_data_parser());
        let result = data.result_ptr();
        DataNew(data.into_ffi(),result.into_ffi())
    }

    fn data_stats(parser: ref Box<WasmDataParser>) -> WasmDataStats {
        let stats = parser.stats();

        WasmDataStats {
            count_event: stats.counts.event,
            count_main: stats.counts.main,
            count_slow: stats.counts.slow,
            count_gps: stats.counts.gps,
            count_gps_home: stats.counts.gps_home,
            progress: stats.progress,
        }
    }

    fn data_next(parser: ref_mut Box<WasmDataParser>) {
        parser.next();
    }
}
