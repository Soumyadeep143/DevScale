// Engine-independent train longitudinal dynamics for Namma Metro driver mode.
// NO Unreal includes on purpose: this exact file is compiled and unit-tested with plain g++
// (native_tests/test_train_dynamics.cpp) and then included by UBLSMetroTrainComponent in the engine.
//
// Parameter defaults are TYPICAL metro values, NOT BMRCL/BEML specifications - replace with the
// published figures before using the numbers for scoring or realism claims.
#pragma once
#include <algorithm>
#include <cmath>

namespace BLS {

struct TrainParams {
  double MaxSpeed = 80.0 / 3.6;      // m/s (Namma Metro operating speed is 80 km/h; verify)
  double MaxAccel = 1.0;             // m/s^2 at full traction notch
  double ServiceDecel = 1.0;         // m/s^2 at full service brake
  double EmergencyDecel = 1.3;       // m/s^2
  double Jerk = 0.9;                 // m/s^3 limit on change of acceleration (passenger comfort)
  double Mass = 3.0e5;               // kg, loaded 6-car set (for future energy model)
  double Davis_A = 2000.0, Davis_B = 30.0, Davis_C = 6.0; // running resistance: A + B*v + C*v^2 [N]
};

struct TrainState {
  double Pos = 0.0;    // m along track
  double Vel = 0.0;    // m/s (>= 0)
  double Accel = 0.0;  // m/s^2 (current, jerk limited)
  bool   EmergencyBrake = false;
  bool   Overspeed = false;
};

// Driver controls: Notch in [-1, 1]; positive = traction, negative = service brake. EB = emergency brake.
struct DriverInput { double Notch = 0.0; bool EB = false; double Gradient = 0.0; /* rise/run, + uphill */ };

inline void Step(TrainState& S, const TrainParams& P, const DriverInput& In, double Dt, double SpeedLimit) {
  double target;
  if (In.EB || S.EmergencyBrake) { S.EmergencyBrake = true; target = -P.EmergencyDecel; }
  else if (In.Notch >= 0.0) target = In.Notch * P.MaxAccel;
  else target = In.Notch * P.ServiceDecel;
  if (S.Vel >= P.MaxSpeed && target > 0) target = 0;                  // traction cut at top speed
  const double dA = P.Jerk * Dt;                                      // jerk-limited approach to the target accel
  S.Accel += std::clamp(target - S.Accel, -dA, dA);
  const double resist = (P.Davis_A + P.Davis_B * S.Vel + P.Davis_C * S.Vel * S.Vel) / P.Mass;
  const double grade = 9.81 * In.Gradient;
  double a = S.Accel - (S.Vel > 0.01 ? resist : 0.0) - grade;
  const double vNew = std::max(0.0, S.Vel + a * Dt);
  S.Pos += 0.5 * (S.Vel + vNew) * Dt;
  S.Vel = vNew;
  if (S.Vel < 1e-3) { S.Vel = 0.0; if (S.Accel < 0) S.Accel = 0.0; if (S.EmergencyBrake) S.EmergencyBrake = false; }
  S.Overspeed = S.Vel > SpeedLimit + 0.5;
}

// Reference "perfect driver" used (a) as an automated test oracle and (b) later as the ATO/ghost for scoring.
// Returns the notch to apply to stop with the nose at TargetPos.
inline double StationStopNotch(const TrainState& S, const TrainParams& P, double TargetPos, double SpeedLimit) {
  const double d = TargetPos - S.Pos;
  if (d <= 0.05) return -1.0;
  const double margin = 0.85;                                          // plan with 85% of the real brake
  const double Dm = P.ServiceDecel * margin;
  // time for the jerk limit to take the current acceleration to -Dm, and the speed/distance gained meanwhile
  const double tR = std::max(0.0, (S.Accel + Dm) / P.Jerk);
  const double vEnd = std::max(0.0, S.Vel + 0.5 * (S.Accel - Dm) * tR);
  const double need = 0.5 * (S.Vel + vEnd) * tR + vEnd * vEnd / (2.0 * Dm);
  if (need >= d) return -std::min(1.0, std::max(0.35, (S.Vel * S.Vel / (2.0 * std::max(d, 0.1))) / P.ServiceDecel));
  if (S.Vel < std::min(SpeedLimit, P.MaxSpeed) - 0.8) return 1.0;
  if (S.Vel > SpeedLimit) return -0.3;
  return 0.0;
}

} // namespace BLS
