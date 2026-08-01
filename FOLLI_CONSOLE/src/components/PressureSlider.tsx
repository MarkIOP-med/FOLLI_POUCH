import React, { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

const TRACK_IMG = require('../../assets/buttons/slider_01.png');
const THUMB_IMG = require('../../assets/buttons/slider_mark.png');

type Props = {
  value: number;
  maximumValue: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  testID?: string;
};

// Design units, measured off console_ui_05 — the console renders on a scaled
// 886x1890 canvas, so these are canvas units rather than device pixels.
const THUMB_SIZE = 78;
const TRACK_HEIGHT = 30;

// Custom slider drawn with the official artwork (slider_01 track capsule +
// slider_mark thumb). We own the pixels ourselves so it renders identically on
// Android, web and in jest. Pure layout + PanResponder.
export default function PressureSlider({
  value,
  maximumValue,
  disabled = false,
  onValueChange,
  testID,
}: Props) {
  const [width, setWidth] = useState(0);

  // Refs so the (stable) PanResponder always sees the latest props/layout.
  const stateRef = useRef({ width: 0, maximumValue, disabled, onValueChange });
  stateRef.current = { width, maximumValue, disabled, onValueChange };

  const handleTouch = (locationX: number) => {
    const { width: w, maximumValue: max, onValueChange: emit } = stateRef.current;
    const usable = w - THUMB_SIZE;
    if (usable <= 0) return;
    const fraction = Math.max(0, Math.min(1, (locationX - THUMB_SIZE / 2) / usable));
    emit(Math.round(fraction * max));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !stateRef.current.disabled,
      onMoveShouldSetPanResponder: () => !stateRef.current.disabled,
      onPanResponderGrant: (evt) => handleTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => handleTouch(evt.nativeEvent.locationX),
    }),
  ).current;

  const fraction = maximumValue > 0 ? Math.max(0, Math.min(1, value / maximumValue)) : 0;
  const thumbLeft = fraction * Math.max(0, width - THUMB_SIZE);

  return (
    <View
      testID={testID}
      style={styles.touchArea}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      {/* pointerEvents 'none' (in style) is load-bearing: touches must always
          target the container so locationX stays container-relative. If a child
          captures the touch (e.g. the thumb), locationX becomes child-relative
          and the value jumps wildly while dragging. */}
      <Image source={TRACK_IMG} style={styles.track} resizeMode="stretch" />
      <Image source={THUMB_IMG} style={[styles.thumb, { left: thumbLeft }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    flex: 1,
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    // width 100%, not `left: 0; right: 0` with an undefined width: on
    // react-native-web the latter leaves the stretched track unconstrained and
    // it runs out past the panel.
    width: '100%',
    height: TRACK_HEIGHT,
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    pointerEvents: 'none',
  },
});
