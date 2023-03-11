use blackbox_log::Unit;

#[derive(Debug, Clone, Copy)]
#[repr(u8)]
pub enum WasmUnit {
    Unitless,
    Acceleration,
    Altitude,
    Amperage,
    Boolean,
    FailsafePhase,
    FlightMode,
    GpsCoordinate,
    GpsHeading,
    Rotation,
    State,
    Velocity,
    Voltage,
}

impl From<Unit> for WasmUnit {
    fn from(unit: Unit) -> Self {
        match unit {
            Unit::Amperage => Self::Amperage,
            Unit::Voltage => Self::Voltage,
            Unit::Acceleration => Self::Acceleration,
            Unit::Rotation => Self::Rotation,
            Unit::FlightMode => Self::FlightMode,
            Unit::State => Self::State,
            Unit::FailsafePhase => Self::FailsafePhase,
            Unit::GpsCoordinate => Self::GpsCoordinate,
            Unit::Altitude => Self::Altitude,
            Unit::Velocity => Self::Velocity,
            Unit::GpsHeading => Self::GpsHeading,
            Unit::Boolean => Self::Boolean,
            Unit::Unitless => Self::Unitless,
        }
    }
}

impl From<WasmUnit> for Unit {
    fn from(unit: WasmUnit) -> Self {
        match unit {
            WasmUnit::Unitless => Self::Unitless,
            WasmUnit::Acceleration => Self::Acceleration,
            WasmUnit::Altitude => Self::Altitude,
            WasmUnit::Amperage => Self::Amperage,
            WasmUnit::Boolean => Self::Boolean,
            WasmUnit::FailsafePhase => Self::FailsafePhase,
            WasmUnit::FlightMode => Self::FlightMode,
            WasmUnit::GpsCoordinate => Self::GpsCoordinate,
            WasmUnit::GpsHeading => Self::GpsHeading,
            WasmUnit::Rotation => Self::Rotation,
            WasmUnit::State => Self::State,
            WasmUnit::Velocity => Self::Velocity,
            WasmUnit::Voltage => Self::Voltage,
        }
    }
}

impl crate::WasmFfi for Unit {
    type Ffi = u32;
}

impl crate::IntoWasmFfi for Unit {
    fn into_ffi(self) -> Self::Ffi {
        match self {
            Self::Unitless => 0,
            Self::Amperage => 1,
            Self::Voltage => 2,
            Self::Acceleration => 3,
            Self::Rotation => 4,
            Self::FlightMode => 5,
            Self::State => 6,
            Self::FailsafePhase => 7,
            Self::GpsCoordinate => 8,
            Self::Altitude => 9,
            Self::Velocity => 10,
            Self::GpsHeading => 11,
            Self::Boolean => 12,
        }
    }
}

impl crate::FromWasmFfi for Unit {
    unsafe fn from_ffi(ffi: Self::Ffi) -> Self {
        match ffi {
            0 => Self::Unitless,
            1 => Self::Amperage,
            2 => Self::Voltage,
            3 => Self::Acceleration,
            4 => Self::Rotation,
            5 => Self::FlightMode,
            6 => Self::State,
            7 => Self::FailsafePhase,
            8 => Self::GpsCoordinate,
            9 => Self::Altitude,
            10 => Self::Velocity,
            11 => Self::GpsHeading,
            12 => Self::Boolean,
            _ => unreachable!(),
        }
    }
}
