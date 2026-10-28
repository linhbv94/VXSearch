/// Physical pixels throughout: works for negative-origin monitors and Retina scaling.
pub fn anchored_position(
    anchor: (f64, f64, f64, f64),
    popup: (f64, f64),
    work: (f64, f64, f64, f64),
    gap: f64,
) -> (i32, i32) {
    let (ax, ay, aw, ah) = anchor;
    let (pw, ph) = popup;
    let (wx, wy, ww, wh) = work;
    let min_x = wx + gap;
    let min_y = wy + gap;
    let max_x = (wx + ww - pw - gap).max(min_x);
    let max_y = (wy + wh - ph - gap).max(min_y);
    let x = (ax + aw / 2.0 - pw / 2.0).clamp(min_x, max_x);
    let below = ay + ah + gap;
    let y = if below + ph <= wy + wh - gap {
        below
    } else {
        ay - ph - gap
    };
    (x.round() as i32, y.clamp(min_y, max_y).round() as i32)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn menu_bar_popup_below_anchor_and_negative_monitor_edges_are_clamped() {
        assert_eq!(
            anchored_position(
                (1200., 0., 24., 24.),
                (380., 64.),
                (0., 24., 1440., 850.),
                6.
            ),
            (1022, 30)
        );
        let (x, y) = anchored_position(
            (-1910., 0., 24., 24.),
            (760., 128.),
            (-1920., 48., 1920., 2000.),
            12.,
        );
        assert_eq!((x, y), (-1908, 60));
    }
    #[test]
    fn bottom_tray_places_popup_above_taskbar_and_tiny_work_area_does_not_panic() {
        assert_eq!(
            anchored_position(
                (1350., 880., 24., 24.),
                (380., 64.),
                (0., 0., 1440., 880.),
                6.
            ),
            (1054, 810)
        );
        assert_eq!(
            anchored_position((0., 0., 20., 20.), (380., 64.), (0., 0., 200., 40.), 6.),
            (6, 6)
        );
    }
}
