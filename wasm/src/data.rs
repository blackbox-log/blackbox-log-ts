use std::mem::ManuallyDrop;
use std::ops::Deref;
use std::pin::Pin;
use std::ptr::NonNull;

use blackbox_log::data::Stats;
use blackbox_log::frame::{Frame, GpsFrame, MainFrame, SlowFrame};
use blackbox_log::prelude::*;
use blackbox_log::units::{si, Time};
use blackbox_log::{Filter, FilterSet};

use crate::ffi::IntoWasmFfi;
use crate::frames::{WasmFrameDef, WasmFrameKind};
use crate::headers::WasmHeaders;
use crate::owned_slice::AllocError;
use crate::str::WasmStr;
use crate::{OwnedSlice, Shared, WasmByValue, WasmFfi};

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
        data: Shared<OwnedSlice<u8>>,
        filters: Option<Box<WasmFilterSetBuilder>>,
    ) -> Self {
        // SAFETY: this is only used to create the `DataParser`, which is guaranteed to
        // be dropped before `headers` by the declaration order in the struct
        let headers_ref = unsafe { headers.deref_static() };

        let filters = filters.map(|filters| filters.build()).unwrap_or_default();

        Self {
            parsed: Box::pin(WasmParseEvent::default()),
            parser: headers_ref.data_parser_with_filters(&filters),
            _headers: headers,
            _data: data,
        }
    }

    fn main_def(&self) -> WasmFrameDef {
        WasmFrameDef::from(&self.parser.main_frame_def())
    }

    fn slow_def(&self) -> WasmFrameDef {
        WasmFrameDef::from(&self.parser.slow_frame_def())
    }

    fn gps_def(&self) -> WasmFrameDef {
        self.parser
            .gps_frame_def()
            .as_ref()
            .map_or_else(WasmFrameDef::default, WasmFrameDef::from)
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

#[allow(dead_code)]
pub struct WasmFilterSetBuilder {
    main: Option<Vec<&'static str>>,
    slow: Option<Vec<&'static str>>,
    gps: Option<Vec<&'static str>>,
    arena: NonNull<u8>,
}

impl_boxed_wasm_ffi!(WasmFilterSetBuilder);

impl WasmFilterSetBuilder {
    fn new(arena_size: usize, main: isize, slow: isize, gps: isize) -> Result<Self, AllocError> {
        Ok(Self {
            main: usize::try_from(main).ok().map(Vec::with_capacity),
            slow: usize::try_from(slow).ok().map(Vec::with_capacity),
            gps: usize::try_from(gps).ok().map(Vec::with_capacity),
            arena: OwnedSlice::<u8>::alloc(arena_size)?,
        })
    }

    /// # SAFETY
    ///
    /// `fields` must come from a `WasmFieldFilterSetBuilder` and `str` must be
    /// allocated in the same struct's `arena`.
    unsafe fn push(&mut self, frame: WasmFrameKind, str: WasmStr) {
        let str: &str = str.deref();
        let str: &'static str = std::mem::transmute(str);

        let fields = match frame {
            WasmFrameKind::Main => self.main.as_mut(),
            WasmFrameKind::Slow => self.slow.as_mut(),
            WasmFrameKind::Gps => self.gps.as_mut(),
        };
        fields.unwrap().push(str);
    }

    fn build(self) -> FilterSet {
        let make_filter = |filter: Option<Vec<&str>>| {
            filter.map_or(Filter::Unfiltered, |fields| {
                Filter::OnlyFields(fields.into_iter().collect())
            })
        };

        FilterSet {
            main: make_filter(self.main),
            slow: make_filter(self.slow),
            gps: make_filter(self.gps),
        }
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

#[repr(C)]
struct FieldFilterSetBuilderNew(<Box<WasmFilterSetBuilder> as WasmFfi>::Ffi, *const u8);

// SAFETY: repr(C) & where bounds for each field
unsafe impl WasmByValue for FieldFilterSetBuilderNew
where
    <Box<WasmFilterSetBuilder> as WasmFfi>::Ffi: WasmByValue,
    *const u8: WasmByValue,
{
}

wasm_export!(free data_free: Box<WasmDataParser>);
wasm_export! {
    fn data_new(headers: ref Box<WasmHeaders>, filters: owned *mut WasmFilterSetBuilder) -> DataNew {
        let filters = if filters.is_null() {
            None
        } else {
            // SAFETY: `filters` is from `Box::into_raw` in `filter_new`
            Some(unsafe { Box::from_raw(filters) })
        };

        let data = Box::new(headers.get_data_parser(filters));
        let result = data.result_ptr();
        DataNew(data.into_ffi(),result.into_ffi())
    }

    fn data_frameDef(parser: ref Box<WasmDataParser>, frame: owned WasmFrameKind) -> Box<WasmFrameDef> {
        let def = match frame {
            WasmFrameKind::Main => parser.main_def(),
            WasmFrameKind::Slow => parser.slow_def(),
            WasmFrameKind::Gps => parser.gps_def(),
        };
        Box::new(def)
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

    fn filter_new(
        arena_size: owned usize,
        main: owned isize,
        slow: owned isize,
        gps: owned isize,
    ) -> FieldFilterSetBuilderNew {
        let builder = Box::new(WasmFilterSetBuilder::new(
            arena_size,
            main,
            slow,
            gps,
        ).unwrap());
        let ptr = builder.arena.as_ptr();
        FieldFilterSetBuilderNew(Box::into_raw(builder), ptr)
    }

    fn filter_push(
        builder: ref_mut Box<WasmFilterSetBuilder>,
        frame: owned WasmFrameKind,
        str: owned WasmStr,
    ) {
        builder.push(frame, str);
    }
}
