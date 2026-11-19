// UNVERIFIED (not compiled).
#include "BLSMetroTrainComponent.h"
#include "Components/SplineComponent.h"
#include "GameFramework/Actor.h"

void UBLSMetroTrainComponent::TickComponent(float Dt, ELevelTick, FActorComponentTickFunction*)
{
  if (!Track) return;
  constexpr double Fixed = 1.0 / 60.0; Accumulator += FMath::Min<double>(Dt, 0.1);       // deterministic fixed step
  while (Accumulator >= Fixed) {
    BLS::DriverInput In; In.Notch = DriverNotch; In.EB = bEmergencyBrake;
    BLS::Step(State, Params, In, Fixed, SpeedLimitMS); Accumulator -= Fixed;
  }
  const float Dist = FMath::Clamp<float>(State.Pos * 100.0, 0.f, Track->GetSplineLength());   // metres -> cm
  const FTransform T = Track->GetTransformAtDistanceAlongSpline(Dist, ESplineCoordinateSpace::World);
  GetOwner()->SetActorTransform(T);
}
