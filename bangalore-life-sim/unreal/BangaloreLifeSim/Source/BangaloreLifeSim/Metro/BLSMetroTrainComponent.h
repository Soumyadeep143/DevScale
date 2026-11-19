// UNVERIFIED (not compiled). Drives a train actor along a track spline using the verified BLS::Step dynamics.
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "BLSTrainDynamics.h"
#include "BLSMetroTrainComponent.generated.h"

class USplineComponent;

UCLASS(ClassGroup=(BLS), meta=(BlueprintSpawnableComponent))
class BANGALORELIFESIM_API UBLSMetroTrainComponent : public UActorComponent { GENERATED_BODY()
public:
  UBLSMetroTrainComponent() { PrimaryComponentTick.bCanEverTick = true; }
  UPROPERTY(EditAnywhere, BlueprintReadWrite) TObjectPtr<USplineComponent> Track;       // one spline per line direction
  UPROPERTY(BlueprintReadWrite) float DriverNotch = 0.f;                                 // -1..1 from the cab controls
  UPROPERTY(BlueprintReadWrite) bool bEmergencyBrake = false;
  UPROPERTY(BlueprintReadWrite) float SpeedLimitMS = 22.f;                               // from the signalling/ATP layer
  UFUNCTION(BlueprintPure) float GetSpeedKph() const { return State.Vel * 3.6f; }
  UFUNCTION(BlueprintPure) float GetDistanceAlongTrack() const { return State.Pos * 100.f; }
  virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
private:
  BLS::TrainParams Params; BLS::TrainState State; double Accumulator = 0;
};
