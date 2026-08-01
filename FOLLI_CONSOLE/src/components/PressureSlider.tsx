import React, { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

const TRACK_IMG = require('../../assets/buttons/slider_01.png');
const THUMB_IMG = require('../../assets/buttons/slider_mark.png');

type Props = {
  value: number;
  /** Low end of the track. Non-zero because the console trims a prescription. */
  minimumValue?: number;
  maximumValue: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  testID?: string;
};

// Design units, measured off console_ui_05 — the console renders on a scaled
// 886x1890 canvas, so these are canvas units rather than device pixels.
const THUMB_SIZE = 78;
const TRACK_HEIGHT = 30;

/**
 * The pressure slider, drawn with the delivered artwork.
 *
 * Two things make a naive implementation feel like it is snapping rather than
 * sliding, and both are handled here.
 *
 * The value is integer mmHg over a narrow trim band — six positions across the
 * whole track at a prescription of 25. Driving the thumb from the committed
 * value therefore teleports it in visible jumps. Instead the thumb follows the
 * finger continuously while dragging, and only settles onto the committed value
 * when released. The emitted value is still whole mmHg; only the rendering is
 * continuous.
 *
 * And `locationX` is measured against whichever view received the touch, so it
 * jitters during a drag. The container's page offset is captured once on grant
 * and every subsequent position comes from the gesture's absolute coordinate.
 */
export default function PressureSlider({
  value,
  minimumValue = 0,
  maximumValue,
  disabled = false,
  onValueChange,
  testID,
}: Props) {
  const [width, setWidth] = useState(0);
  // Where the finger is, 0..1, while a drag is in progress. Null when settled.
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  // Refs so the (stable) PanResponder always sees the latest props/layout.
  const stateRef = useRef({ width: 0, minimumValue, maximumValue, disabled, onValueChange });
  stateRef.current = { width, minimumValue, maximumValue, disabled, onValueChange };

  // Page X of the track's left edge, captured when the gesture starts.
  const originRef = useRef(0);

  const applyAt = (containerX: number) => {
    const { width: w, minimumValue: min, maximumValue: max, onValueChange: emit } =
      stateRef.current;
    const usable = w - THUMB_SIZE;
    // A zero-width band (an unprescribed zone) would divide by zero below, and
    // there is nothing to emit anyway.
    if (usable <= 0 || max <= min) return;

    const fraction = Math.max(0, Math.min(1, (containerX - THUMB_SIZE / 2) / usable));
    setDragFraction(fraction);
    emit(Math.round(min + fraction * (max - min)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !stateRef.current.disabled,
      onMoveShouldSetPanResponder: () => !stateRef.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const { pageX, locationX } = evt.nativeEvent;
        originRef.current = pageX - locationX;
        applyAt(locationX);
      },
      onPanResponderMove: (_evt, gesture) => applyAt(gesture.moveX - originRef.current),
      // Settle onto the committed value so the thumb never rests between stops.
      onPanResponderRelease: () => setDragFraction(null),
      onPanResponderTerminate: () => setDragFraction(null),
    }),
  ).current;

  const span = maximumValue - minimumValue;
  const settledFraction =
    span > 0 ? Math.max(0, Math.min(1, (value - minimumValue) / span)) : 0;
  const thumbLeft =
    (dragFraction ?? settledFraction) * Math.max(0, width - THUMB_SIZE);

  return (
    <View
      testID={testID}
      style={styles.touchArea}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      {/* pointerEvents 'none' on both children is load-bearing: the touch has to
          land on the container, or the grant handler's locationX is measured
          against a child and the origin comes out wrong. */}
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
