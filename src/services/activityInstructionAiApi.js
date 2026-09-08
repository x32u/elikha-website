import { supabase } from '../lib/supabase';
import { sanitizeActivityColorPalette } from '../utils/arColorPalette';
import {
  detectColorRequirementsLocally,
  sanitizeColorRequirements,
} from '../utils/activityColorRequirements';

export const detectActivityColorRequirements = async ({ instructions, targets, allowedColors = [] }) => {
  const palette = sanitizeActivityColorPalette(allowedColors);
  const fallback = detectColorRequirementsLocally({ instructions, targets, allowedColors: palette });
  try {
    const { data, error } = await supabase.functions.invoke('analyze-activity-instructions', {
      body: { instructions, targets, colors: palette },
    });
    if (error) throw error;
    return { success: true, data: sanitizeColorRequirements(data?.requirements, palette), source: 'ai' };
  } catch (error) {
    return {
      success: fallback.length > 0,
      data: fallback,
      source: 'local',
      error: fallback.length ? '' : (error?.message || 'No color targets were found.'),
    };
  }
};
